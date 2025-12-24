import { getRegisteredThunks } from './actions';
import type { ActionQueue } from './queue';
import type { Action, AsyncAction } from './types';

/**
 * @template TState - The overall type of your application's state.
 * @template {Record<string, any>} TDependencies - The type of the object containing application dependencies.
 *
 * Configuration object for the middleware pipeline.
 * This object provides the necessary context and utilities to each middleware function.
 * It's the `config` parameter received by middleware functions like `exclusive` and `concurrent`.
 */
export interface MiddlewareConfig<TState = any, TDependencies extends Record<string, any> = Record<string, any>> {
  dispatch: (action: Action | AsyncAction) => Promise<void>;
  getState: () => TState;
  dependencies: () => TDependencies;
  queue: ActionQueue;
}

/**
 * Functional handler for managing actions within middleware.
 *
 * @param {MiddlewareConfig} config - Configuration object for the middleware.
 * @returns {Function} - A function to handle actions.
 */
export function createActionHandler(
  config: MiddlewareConfig,
  options: { lockThunks?: boolean } = {}
) {
  const getState = config.getState;
  const dependencies = config.dependencies;
  const queue = config.queue ?? { enqueue: async (operation: () => Promise<void> | void) => operation() };
  const lockThunks = options.lockThunks ?? false;


  /**
   * Handles the given action, processing it either synchronously or asynchronously.
   *
   * @param {Action | AsyncAction} action - The action to be processed.
   * @param {Function} next - The next middleware function in the chain.
   * @param {boolean} isNestedDispatch - Indicates whether the action is dispatched from within another action.
   * @returns {Promise<void> | void} - A promise if the action is asynchronous, otherwise void.
   */
  const handleAction = async (
    action: Action | AsyncAction,
    next: Function,
    lockOrNested: any = false,
    maybeNestedDispatch: boolean = false
  ): Promise<void> => {
    const isNestedDispatch =
      typeof lockOrNested === 'boolean' ? lockOrNested : Boolean(maybeNestedDispatch);

    if (typeof action === 'function') {
      const runThunk = async () =>
        (action as AsyncAction)(
          async (dispatchedAction: Action | AsyncAction) => {
            await handleAction(dispatchedAction, next, true);
          },
          getState,
          dependencies()
        );

      if (lockThunks && !isNestedDispatch) {
        await runThunk();
        return;
      }

      await runThunk();
      return;
    } else {
      await queue.enqueue(() => next(action), {
        inlineIfRunning: isNestedDispatch,
      });
      return;
    }
  };

  return handleAction;
}

/**
 * Function to create the starter middleware factory.
 * This factory function returns a middleware creator that takes strategy information as arguments and returns the actual middleware function.
 *
 * @returns Function - The middleware creator function.
 */
export const createStarter = () => {
  /**
   * Determines if a thunk should be triggered by a given action.
   *
   * Each thunk may define a `triggers` array. A trigger can be:
   * 1. A string — representing an action type to match exactly.
   * 2. A function — that receives the action and returns a boolean indicating
   *    whether the thunk should run.
   *
   * This function evaluates all triggers for a given thunk and returns `true`
   * if at least one trigger matches the action.
   *
   * @param {any} thunk - The thunk object that may have a `triggers` property.
   * @param {Action} action - The action being dispatched in the middleware.
   * @returns {boolean} `true` if the thunk should be executed for the given action; `false` otherwise.
   *
   * @example
   * const thunk = { triggers: ['INCREMENT'] };
   * matchesAction(thunk, { type: 'INCREMENT' }); // true
   *
   * const thunkFn = { triggers: [action => action.value > 10] };
   * matchesAction(thunkFn, { type: 'SET_VALUE', value: 15 }); // true
   */
  function matchesAction(thunk: any, action: Action) {
    const triggers = thunk.triggers;
    if (!Array.isArray(triggers) || triggers.length === 0) return false;
    return triggers.some((t: any) => {
      if (typeof t === 'string') return t === action.type;
      if (typeof t === 'function') {
        try { return Boolean(t(action)); } catch { return false; }
      }
      return false;
    });
  }

  /**
   * Ensures we execute the thunk body rather than the thunk creator itself.
   * Registered thunks are creators, so we call them without arguments to
   * retrieve the actual async action.
   */
  const resolveThunk = (thunk: any) => {
    if (typeof thunk === 'function' && thunk.isThunk) {
      try {
        return thunk();
      } catch (err: any) {
        console.warn(`[starter] Failed to instantiate thunk "${thunk.type ?? 'unknown'}": ${err?.message ?? err}`);
        return null;
      }
    }
    return thunk;
  };

  /**
   * Middleware function for handling actions exclusively.
   *
   * This middleware ensures only one action is processed at a time and queues new actions until the current one finishes.
   *
   * @param args - Arguments provided by the middleware pipeline.
   *   * dispatch - Function to dispatch actions.
   *   * getState - Function to get the current state.
   *   * dependencies - Function to get dependencies.
   * @param next - Function to call the next middleware in the chain.
   * @returns Function - The actual middleware function that handles actions.
   */
  const exclusive = (config: MiddlewareConfig) => {
    const handler = createActionHandler(config, { lockThunks: true });
    const queue = config.queue ?? { enqueue: async (operation: () => Promise<void> | void) => operation() };
    const onError = console.warn;

    return (next: Function) => async (action: { type: string }) => {
      return queue.enqueue(async () => {
        try {
          await handler(action as any, next, true);

          // sequentially trigger matching thunks
          for (const thunk of getRegisteredThunks()) {
            if (matchesAction(thunk, action as any)) {
              const runnableThunk = resolveThunk(thunk);
              if (runnableThunk) {
                try {
                  await handler(runnableThunk, next, true);
                } catch (err: any) {
                  const msg =
                    err instanceof Error ? err.message : String(err ?? 'unknown');
                  onError(
                    `[starter] [exclusive] Thunk error while processing action "${action?.type ?? 'unknown'}": ${msg}`
                  );
                }
              }
            }
          }
        } catch (err: any) {
          onError(`[starter] [exclusive] Unhandled error while processing action "${action?.type ?? 'unknown'}": ${err.message}`);
        }
      });
    };
  };

  /**
   * Middleware function for handling actions concurrently.
   *
   * This middleware allows multiple async actions to be processed simultaneously.
   *
   * @param args - Arguments provided by the middleware pipeline (same as exclusive).
   * @param next - Function to call the next middleware in the chain.
   * @returns Function - The actual middleware function that handles actions.
   */
  const concurrent = (config: MiddlewareConfig) => {
    const handler = createActionHandler(config, { lockThunks: false });
    const inflight = new Set<Promise<void>>();
    const onError = console.warn;

    // Attach small control surface for diagnostics/teardown
    const middleware = (next: Function) => {
      // expose helpers on the returned function (non-enumerable to be unobtrusive)
      const fn = async (action: { type: string }) => {
        // DO NOT await; return quickly for true concurrency
        const p = (async () => {
          // handle main action
          await handler(action, next);

          // find matching thunks
          const matching = getRegisteredThunks()
            .filter(thunk => matchesAction(thunk, action));

          // run thunks concurrently, but handle errors individually
          const results = await Promise.allSettled(
            matching
              .map(resolveThunk)
              .filter(Boolean)
              .map(thunk => handler(thunk as AsyncAction, next))
          );

          for (const r of results) {
            if (r.status === 'rejected') {
              const msg =
                r.reason instanceof Error
                  ? r.reason.message
                  : String(r.reason ?? 'unknown');
              onError(
                `[starter] [concurrent] Thunk error while processing action "${action?.type ?? 'unknown'}": ${msg}`
              );
            }
          }
        })();

        inflight.add(p);

        // ensure cleanup + error reporting
        p.catch(err => {
          const msg = err instanceof Error ? err.message : String(err ?? 'unknown');
          onError(
            `[starter] [concurrent] Unhandled error while processing action "${action?.type ?? 'unknown'}": ${msg}`
          );
        }).finally(() => {
          inflight.delete(p);
        });

        // For compatibility, return the promise in case caller wants to await.
        return p;
      };

      Object.defineProperties(fn, {
        pendingCount: {
          value: () => inflight.size,
        },
        waitForAll: {
          value: async () => {
            if (inflight.size === 0) return [];
            // Snapshot to avoid mutation while awaiting
            return Promise.allSettled(Array.from(inflight));
          },
        },
      });

      return fn as typeof fn & {
        pendingCount(): number;
        waitForAll(): Promise<PromiseSettledResult<void>[]>;
      };
    };

    return middleware;
  };

  // Map strategy names to functions
  const strategies: Record<string, any> = {
    'exclusive': exclusive,
    'concurrent': concurrent
  };

  const defaultStrategy = 'concurrent';

  // Create a method to select the strategy
  const selectStrategy = ({ dispatch, getState, dependencies, strategy, queue, stack }: any) => (next: Function) => {
    let strategyName: string;
    try {
      strategyName = String(strategy?.());
    } catch {
      strategyName = 'unknown';
    }

    let strategyFunc = strategies[strategyName];
    if (!strategyFunc) {
      console.warn(`[starter] Unknown strategy: ${strategyName}, default is used: ${defaultStrategy}`);
      strategyFunc = strategies[defaultStrategy];
    }

    return strategyFunc({ dispatch, getState, dependencies, queue, stack })(next);
  };

  selectStrategy.signature = 'i.p.5.j.7.0.2.1.8.b';
  return selectStrategy;
};

// Create the starter middleware
/**
 * Default starter middleware instance.
 */
export const starter = createStarter();
