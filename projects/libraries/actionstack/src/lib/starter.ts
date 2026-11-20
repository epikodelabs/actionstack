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
type DispatchPhase =
  | { phase: 'afterAction'; action: Action; nested: boolean }
  | { phase: 'triggerSequentially' | 'triggerConcurrently'; action: Action };
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
 * Creates a runner that drives one async generator per dispatch.
 *
 * @param config - Store services shared by dispatches.
 * @param options - Nested queue behavior and the hook to run after a plain action.
 * @param strategy - Scheduling policy for top-level dispatches from starter.
 * @returns A runner that advances the lifecycle through any post-action work.
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
   * Applies an action or awaits a thunk under the selected scheduling policy.
   * Exclusive top-level runs keep the store queue slot until the entire run
   * settles. Concurrent runs queue each plain action individually.
   *
   * @param action - Plain action or legacy thunk to execute.
   * @param next - Downstream middleware entry point.
   * @param scope - Whether this run entered through starter, is nested, or is standalone.
   * @yields Post-action work after downstream middleware succeeds.
   * @returns The result of downstream middleware or the thunk.
   */
  async function* dispatchLifecycle(
    action: DispatchInput,
    next: Function,
    scope: DispatchScope,
  ): AsyncGenerator<DispatchPhase, any, void> {
    if (scope === 'topLevel' && strategy === 'exclusive') {
      // The queue owns the whole run. Its children reuse that ownership.
      return queue.enqueue(() => run(action, next, 'nested'));
    }

    const nested = scope === 'nested';
    if (typeof action === 'function') {
      return action((child: DispatchInput) => run(child, next, 'nested'), getState, dependencies());
    }

    const apply = () => queue.enqueue(() => next(action), { inlineIfRunning: lockThunks && nested });
    const result = await (nested && nestedQueue ? nestedQueue.enqueue(apply) : apply());
    // The driver receives the action only after downstream middleware succeeds.
    if (strategy === 'exclusive') {
      yield { phase: 'triggerSequentially', action };
    } else if (strategy === 'concurrent') {
      yield { phase: 'triggerConcurrently', action };
    } else if (afterAction) {
      yield { phase: 'afterAction', action, nested };
    }
    return result;
  }

  async function runTriggers(
    action: Action,
    next: Function,
    phase: 'triggerSequentially' | 'triggerConcurrently',
  ): Promise<void> {
    const thunks = getRegisteredThunks(config.registry);
    const reportFailure = (error: unknown) => {
      warn(`[starter] [${strategy}] Thunk error while processing action "${action?.type ?? 'unknown'}": ${errorMessage(error)}`);
    };

    if (phase === 'triggerSequentially') {
      for (const thunk of thunks) {
        if (!matchesAction(thunk, action)) continue;
        const thunkAction = resolveThunk(thunk);
        if (thunkAction) await run(thunkAction, next, 'nested').catch(reportFailure);
      }
      return;
    }

    const runs = thunks.filter(thunk => matchesAction(thunk, action)).map(resolveThunk);
    const results = await Promise.allSettled(
      runs.filter(thunk => !!thunk).map(thunk => run(thunk, next, 'nested')),
    );
    for (const result of results) {
      if (result.status === 'rejected') reportFailure(result.reason);
    }
  }

  async function run(
    action: DispatchInput,
    next: Function,
    scope: DispatchScope,
  ): Promise<any> {
    const lifecycle = dispatchLifecycle(action, next, scope);
    let step = await lifecycle.next();

    while (!step.done) {
      try {
        const { value } = step;
        if (value.phase === 'afterAction') {
          await afterAction?.(value.action, next, value.nested);
        } else {
          await runTriggers(value.action, next, value.phase);
        }
      } catch (error) {
        await lifecycle.return(undefined);
        throw error;
      }
      step = await lifecycle.next();
    }

    return step.value;
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
 * thunks overlap. Failures from triggered thunks are logged independently of
 * the triggering dispatch.
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
