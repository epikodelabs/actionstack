import { getRegisteredThunks } from './actions';
import { createQueue, type ActionQueue } from './queue';
import type { Action, ActionRegistry, AsyncAction, Dispatch, MiddlewareAPI, StatefulMiddlewareAPI } from './types';

/**
 * Store services available to the starter's action handler.
 *
 * @typeParam TState - State exposed to legacy thunks.
 * @typeParam TDependencies - Services injected into legacy thunks.
 */
export interface MiddlewareConfig<TState = any, TDependencies extends Record<string, any> = Record<string, any>> {
  /** The store's public dispatch function. */
  dispatch: Dispatch<TState, TDependencies>;
  /** Reads the current state for legacy thunks. */
  getState: () => TState;
  /** Retrieves the services to inject when a legacy thunk starts. */
  dependencies: () => TDependencies;
  /** Serializes work that applies actions to the store. */
  queue: ActionQueue;
  /** Holds the thunk creators eligible for post-action triggers. */
  registry: ActionRegistry;
}

type DispatchInput = Action | AsyncAction;
type Strategy = 'exclusive' | 'concurrent';
type RegisteredThunk = ReturnType<typeof getRegisteredThunks>[number];
type DispatchScope = 'topLevel' | 'nested' | 'standalone';
type TriggerPhase = 'triggerSequentially' | 'triggerConcurrently';
type DispatchPhase =
  | { phase: 'afterAction'; action: Action; nested: boolean; completion: Promise<void> }
  | { phase: TriggerPhase; action: Action; completion: Promise<void> };
type ActionHandlerOptions = {
  /** Lets nested dispatches reuse an active queue slot while serializing nested action application. */
  lockThunks?: boolean;
  /** Runs after downstream middleware resolves for a plain action. */
  afterAction?: (action: Action, next: Function, isNestedDispatch: boolean) => Promise<void>;
};

const immediateQueue = {
  async enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
    return operation();
  },
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'unknown');
}

/**
 * Creates a handler that queues plain actions and runs legacy thunks with nested dispatch.
 *
 * @param config - Store services used to apply actions and invoke thunks.
 * @param options - Nested queue behavior and an optional post-action hook.
 * @returns A handler that resolves with the downstream middleware or thunk result
 * and rejects on failure.
 */
export function createActionHandler(
  config: MiddlewareConfig,
  options: ActionHandlerOptions = {},
) {
  const run = createDispatchMachine(config, options);
  return (
    action: DispatchInput,
    next: Function,
    nestedOrLegacyLock: unknown = false,
    legacyNested = false,
  ) => {
    const nested = typeof nestedOrLegacyLock === 'boolean' ? nestedOrLegacyLock : Boolean(legacyNested);
    return run(action, next, nested ? 'nested' : 'standalone');
  };
}

/**
 * Creates a runner that drives one async generator per plain action.
 *
 * Thunks and exclusive top-level dispatches bypass the generator: they have no
 * post-action phases, and exclusive mode already keeps the whole run inside one
 * queue slot.
 *
 * @param config - Store services shared by dispatches.
 * @param options - Nested queue behavior and the hook to run after a plain action.
 * @param strategy - Scheduling policy for top-level dispatches from starter.
 * @returns A runner that applies the action and settles any post-action work.
 */
function createDispatchMachine(
  config: MiddlewareConfig,
  options: ActionHandlerOptions,
  strategy?: Strategy,
) {
  const { getState, dependencies } = config;
  const { lockThunks = strategy === 'exclusive', afterAction } = options;
  const queue = config.queue ?? immediateQueue;
  const nestedQueue = lockThunks ? createQueue() : undefined;
  const warn = console.warn;

  /**
   * Collects registered thunks whose triggers match a just-applied action.
   *
   * Trigger predicates run after the action reached downstream middleware,
   * preserving their original observation point.
   *
   * @param action - The action that downstream middleware finished applying.
   * @returns Matching thunk creators, in registration order.
   */
  function matchingThunks(action: Action): RegisteredThunk[] {
    return getRegisteredThunks(config.registry).filter(thunk => matchesAction(thunk, action));
  }

  /**
   * Applies a plain action, then starts any post-action work.
   *
   * The action is applied through the queue. Afterwards, matching trigger
   * thunks (or the legacy post-action hook) are started synchronously inside
   * this generator turn and only their completion is yielded. Starting the
   * work before yielding matters: when a sibling action is already queued, the
   * queue advances as soon as the current action settles, so a deferred start
   * would let the sibling apply first and change the state that triggers see.
   *
   * @param action - Plain action to apply.
   * @param next - Downstream middleware entry point.
   * @param scope - Whether this run is nested under another dispatch.
   * @yields Post-action work that started with this action's completion.
   * @returns The result of downstream middleware.
   */
  async function* plainActionLifecycle(
    action: Action,
    next: Function,
    scope: DispatchScope,
  ): AsyncGenerator<DispatchPhase, any, void> {
    const nested = scope === 'nested';
    const apply = () => queue.enqueue(() => next(action), { inlineIfRunning: lockThunks && nested });
    const result = await (nested && nestedQueue ? nestedQueue.enqueue(apply) : apply());

    if (strategy) {
      const thunks = matchingThunks(action);
      if (thunks.length > 0) {
        const phase: TriggerPhase =
          strategy === 'exclusive' ? 'triggerSequentially' : 'triggerConcurrently';
        yield { phase, action, completion: runTriggeredThunks(action, thunks, next, phase) };
      }
    } else if (afterAction) {
      yield { phase: 'afterAction', action, nested, completion: afterAction(action, next, nested) };
    }

    return result;
  }

  /**
   * Runs the thunks that matched an applied action.
   *
   * Exclusive mode awaits each thunk in order; concurrent mode starts them
   * together and logs failures individually. Trigger failures never reject the
   * triggering dispatch.
   *
   * @param action - The action whose triggers matched.
   * @param thunks - Matching thunk creators.
   * @param next - Downstream middleware entry point.
   * @param phase - Sequential or concurrent scheduling policy.
   */
  async function runTriggeredThunks(
    action: Action,
    thunks: RegisteredThunk[],
    next: Function,
    phase: TriggerPhase,
  ): Promise<void> {
    const reportFailure = (error: unknown) => {
      warn(`[starter] [${strategy}] Thunk error while processing action "${action?.type ?? 'unknown'}": ${errorMessage(error)}`);
    };

    if (phase === 'triggerSequentially') {
      for (const thunk of thunks) {
        const thunkAction = resolveThunk(thunk);
        if (thunkAction) await run(thunkAction, next, 'nested').catch(reportFailure);
      }
      return;
    }

    const results = await Promise.allSettled(
      thunks
        .map(resolveThunk)
        .filter((thunk): thunk is AsyncAction => !!thunk)
        .map(thunk => run(thunk, next, 'nested')),
    );
    for (const result of results) {
      if (result.status === 'rejected') reportFailure(result.reason);
    }
  }

  /**
   * Advances a plain action's generator through its post-action phases.
   *
   * @param action - Plain action to apply.
   * @param next - Downstream middleware entry point.
   * @param scope - Whether this run is nested under another dispatch.
   * @returns The result of downstream middleware.
   */
  async function runPlainAction(action: Action, next: Function, scope: DispatchScope): Promise<any> {
    const lifecycle = plainActionLifecycle(action, next, scope);
    let step = await lifecycle.next();

    while (!step.done) {
      try {
        await step.value.completion;
      } catch (error) {
        await lifecycle.return(undefined);
        throw error;
      }
      step = await lifecycle.next();
    }

    return step.value;
  }

  /**
   * Applies an action or awaits a thunk under the selected scheduling policy.
   *
   * @param action - Plain action or legacy thunk to execute.
   * @param next - Downstream middleware entry point.
   * @param scope - Whether this run entered through starter, is nested, or is standalone.
   * @returns The downstream middleware or thunk result.
   */
  async function run(
    action: DispatchInput,
    next: Function,
    scope: DispatchScope,
  ): Promise<any> {
    if (scope === 'topLevel' && strategy === 'exclusive') {
      // The queue owns the whole run. Its children reuse that ownership.
      return queue.enqueue(() => run(action, next, 'nested'));
    }

    if (typeof action === 'function') {
      return action((child: DispatchInput) => run(child, next, 'nested'), getState, dependencies());
    }

    return runPlainAction(action, next, scope);
  }

  return run;
}

function matchesAction(thunk: RegisteredThunk, action: Action): boolean {
  return Array.isArray(thunk.triggers) && thunk.triggers.some(trigger => {
    if (typeof trigger === 'string') return trigger === action?.type;
    if (typeof trigger !== 'function') return false;
    try {
      return Boolean(trigger(action));
    } catch {
      return false;
    }
  });
}

function resolveThunk(thunk: RegisteredThunk): AsyncAction | undefined {
  if (typeof thunk === 'function' && thunk.isThunk) {
    try {
      return thunk();
    } catch (error) {
      console.warn(`[starter] Failed to instantiate thunk "${thunk.type ?? 'unknown'}": ${errorMessage(error)}`);
      return;
    }
  }
  return thunk as unknown as AsyncAction;
}

function selectStrategy(readStrategy: MiddlewareAPI['strategy']): Strategy {
  let name: string;
  try {
    name = String(readStrategy?.());
  } catch {
    name = 'unknown';
  }

  if (name === 'exclusive' || name === 'concurrent') return name;
  console.warn(`[starter] Unknown strategy: ${name}, default is used: concurrent`);
  return 'concurrent';
}

/**
 * Creates the outer middleware that schedules dispatches and runs post-action triggers.
 *
 * Exclusive mode serializes entire top-level dispatches and runs matching thunks
 * in order. Concurrent mode serializes plain action application and lets matching
 * thunks overlap. Matching triggers start as soon as the action settles — before
 * a queued sibling action applies — so they observe the state produced by the
 * action that triggered them. Failures from triggered thunks are logged
 * independently of the triggering dispatch.
 *
 * @returns Middleware that selects the store's strategy when bound to the pipeline.
 */
export function createStarter() {
  function starterMiddleware(api: StatefulMiddlewareAPI) {
    return (next: Function) => {
      const strategy = selectStrategy(api.strategy);
      const exclusive = strategy === 'exclusive';
      const warn = console.warn;
      const inflight = new Set<Promise<any>>();

      const runDispatch = createDispatchMachine(api, {}, strategy);

      function reportDispatchFailure(action: DispatchInput, error: unknown) {
        const type = (action as Partial<Action> | null)?.type ?? 'unknown';
        warn(`[starter] [${strategy}] Unhandled error while processing action "${type}": ${errorMessage(error)}`);
      }

      if (exclusive) {
        return async (action: DispatchInput) => {
          try {
            return await runDispatch(action, next, 'topLevel');
          } catch (error) {
            reportDispatchFailure(action, error);
            throw error;
          }
        };
      }

      async function dispatch(action: DispatchInput) {
        const pending = runDispatch(action, next, 'topLevel');
        inflight.add(pending);
        pending.catch(error => reportDispatchFailure(action, error)).finally(() => inflight.delete(pending));
        return pending;
      }

      return Object.defineProperties(dispatch, {
        pendingCount: { value: () => inflight.size },
        waitForAll: { value: () => Promise.allSettled([...inflight]) },
      }) as typeof dispatch & {
        pendingCount(): number;
        waitForAll(): Promise<PromiseSettledResult<void>[]>;
      };
    };
  }

  starterMiddleware.signature = 'i.p.5.j.7.0.2.1.8.b';
  return starterMiddleware;
}

/** Default starter middleware used by the store. */
export const starter = createStarter();
