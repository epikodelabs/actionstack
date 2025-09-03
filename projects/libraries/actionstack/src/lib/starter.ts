import { registeredThunks } from './actions';
import { createLock, SimpleLock } from './lock';
import { Action, AsyncAction } from './types';

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
  lock: SimpleLock;
}

/**
 * Functional handler for managing actions within middleware.
 *
 * @param {MiddlewareConfig} config - Configuration object for the middleware.
 * @returns {Function} - A function to handle actions.
 */
export function createActionHandler(config: MiddlewareConfig) {
  const getState = config.getState;
  const dependencies = config.dependencies;

  /**
   * Handles the given action, processing it either synchronously or asynchronously.
   *
   * @param {Action | AsyncAction} action - The action to be processed.
   * @param {Function} next - The next middleware function in the chain.
   * @param {SimpleLock} lock - The lock instance to manage concurrency for this action.
   * @returns {Promise<void> | void} - A promise if the action is asynchronous, otherwise void.
   */
  const handleAction = async (
    action: Action | AsyncAction,
    next: Function,
    lock: SimpleLock
  ): Promise<void> => {
    await lock.acquire();

    try {
      if (typeof action === 'function') {
        const innerLock = createLock();
        // Process async actions asynchronously and track them
        await (action as AsyncAction)(
          // dispatch function passed into thunk
          async (dispatchedAction: Action | AsyncAction) => {
            // recursively handle dispatched actions with its own lock
            await handleAction(dispatchedAction, next, innerLock);
          },
          getState,
          dependencies()
        );
      } else {
        // Process regular synchronous actions
        await next(action);
        // After passing action, check registered thunks for triggers
        for (const thunk of registeredThunks.values()) {
          const triggers = (thunk as any).triggers;
          if (!Array.isArray(triggers) || triggers.length === 0) continue;
          const matches = triggers.some((t: any) => {
            if (typeof t === 'string') return t === action.type;
            if (typeof t === 'function') {
              try {
                return Boolean(t(action));
              } catch {
                return false;
              }
            }
            return false;
          });

          if (matches) {
            const innerLock = createLock();
            await handleAction(thunk, next, innerLock);
          }
        }
      }
    } finally {
      lock.release();
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
    const handler = createActionHandler(config);
    const lockInstance = config.lock;
    const onError = console.warn;

    return (next: Function) => async (action: { type: string }) => {
      try {
        await handler(action, next, lockInstance);
      } catch (err: any) {
        onError(`[starter] [exclusive] Unhandled error while processing action "${action?.type ?? 'unknown'}": ${err.message}`);
      }
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
    const handler = createActionHandler(config);
    const inflight = new Set<Promise<void>>();
    const onError = console.warn;

    // Attach small control surface for diagnostics/teardown
    const middleware = (next: Function) => {
      // expose helpers on the returned function (non-enumerable to be unobtrusive)
      const fn = async (action: { type: string }) => {
        // DO NOT await; return quickly for true concurrency
        const p = (async () => {
          const perActionLock = createLock(); // critical: do not use shared lock here
          await handler(action, next, perActionLock);
        })();

        inflight.add(p);

        // ensure cleanup + error reporting
        p.catch(err => onError(`[starter] [concurrent] Unhandled error while processing action "${action?.type ?? 'unknown'}": ${err.message}`)).finally(() => {
          inflight.delete(p);
        });

        // For compatibility, return the promise in case caller wants to await.
        return p;
      };

      Object.defineProperties(fn, {
        pendingCount: {
          get: () => inflight.size,
        },
        waitForAll: {
          value: async () => {
            if (inflight.size === 0) return;
            // Snapshot to avoid mutation while awaiting
            await Promise.allSettled(Array.from(inflight));
          },
        },
      });

      return fn as typeof fn & {
        readonly pendingCount: number;
        waitForAll(): Promise<void>;
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
  const selectStrategy = ({ dispatch, getState, dependencies, strategy, lock, stack }: any) => (next: Function) => async (action: Action) => {
    let strategyFunc = strategies[strategy()];
    if (!strategyFunc) {
      console.warn(`[starter] Unknown strategy: ${strategy}, default is used: ${defaultStrategy}`);
      strategyFunc = strategies[defaultStrategy];
    }
    return strategyFunc({ dispatch, getState, dependencies, lock, stack })(next)(action);
  };

  selectStrategy.signature = 'i.p.5.j.7.0.2.1.8.b';
  return selectStrategy;
};

// Create the starter middleware
export const starter = createStarter();
