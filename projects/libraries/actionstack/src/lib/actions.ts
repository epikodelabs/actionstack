import { isAction } from './types';
import type { Action, ActionCreator, ActionHandler, AsyncAction, FeatureModule, ThunkCreator, ThunkAction, ThunkTrigger } from './types';

export { createAction as action, createThunk as thunk };

/**
 * Internal registry of action handlers.
 *
 * Each key is a namespaced action type (string),
 * and each value is the function that handles the action when dispatched.
 *
 * @type {Map<string, ActionHandler>}
 */
const actionHandlers = new Map<string, ActionHandler>();

/**
 * Internal registry of thunks (asynchronous action creators).
 *
 * Each key is a namespaced action type (string),
 * and each value is a thunk creator function that can be invoked by the middleware.
 *
 * @type {Map<string, ThunkCreator<any, any, any>>}
 */
const registeredThunks = new Map<string, ThunkCreator<any, any, any, any[]>>();

/**
 * Returns an array of all registered thunk creators.
 *
 * Thunks are asynchronous action creators that can be automatically
 * invoked by the middleware when their corresponding actions are dispatched.
 *
 * @returns {ThunkCreator<any, any, any>[]} Array of registered thunk creators.
 */
export const getRegisteredThunks = () => Array.from(registeredThunks.values());

/**
 * Retrieves the registered handler function for a specific action type.
 *
 * @param {string} type - The action type to look up.
 * @returns {Function | undefined} The handler function associated with the action type, or `undefined` if none is registered.
 */
export const getActionHandlers = (type: string) => actionHandlers.get(type);

/**
 * Registers all action handlers defined in a feature module into the global action handler map.
 *
 * This function iterates over the module's actions and adds their handlers to an internal
 * registry used for dispatching. If a handler is already registered for the same action type,
 * a warning is logged and the existing handler is overwritten.
 *
 * @param module - The feature module containing actions with associated handlers.
 */
export const registerActionHandlers = (module: FeatureModule) => {
  Object.values(module.actions).forEach((action: any) => {
    if (action.type && actionHandlers.has(action.type)) {
      console.warn(
        `Action handler for "${action.type}" already registered - overwriting`
      );
    } else if (action.type) {
      actionHandlers.set(action.type, action.handler);
    }
  });
};

/**
 * Unregisters all action handlers associated with a feature module.
 *
 * This function removes the module's action handlers from the internal registry,
 * effectively disabling those actions from being handled after the module is destroyed.
 *
 * @param module - The feature module whose action handlers should be removed.
 */
export const unregisterActionHandlers = (module: FeatureModule) => {
  Object.values(module.actions).forEach((action: any) => {
    if (action.type && actionHandlers.has(action.type)) {
      actionHandlers.delete(action.type);
    }
  });
};

/**
 * Registers all thunks defined in a feature module into the global thunk registry.
 *
 * This allows the store's middleware to automatically invoke thunks
 * when their `triggers` match a dispatched action.
 *
 * If a thunk is already registered under the same type, a warning is logged and the
 * existing thunk is overwritten.
 *
 * @param module - The feature module containing thunks to be registered.
 */
export const registerThunks = (module: FeatureModule) => {
  const sourceActions = (module as any).__rawActions ?? module.actions;
  Object.values(sourceActions || {}).forEach((thunk: any) => {
    if (thunk.isThunk && thunk.type) {
      if (registeredThunks.has(thunk.type)) {
        console.warn(
          `Thunk "${thunk.type}" already registered - overwriting`
        );
        return;
      }

      registeredThunks.set(thunk.type, thunk);
    }

  });
};

/**
 * Unregisters all thunks associated with a feature module.
 *
 * This removes the module's thunks from the internal registry,
 * preventing them from being triggered automatically after
 * the module is destroyed.
 *
 * @param module - The feature module whose thunks should be removed.
 */
export const unregisterThunks = (module: FeatureModule) => {
  const sourceActions = (module as any).__rawActions ?? module.actions;
  Object.values(sourceActions || {}).forEach((thunk: any) => {
    if (thunk.isThunk && thunk.type && registeredThunks.has(thunk.type)) {
      registeredThunks.delete(thunk.type);
    }
  });
};

/**
 * Creates a synchronous action creator function.
 *
 * Overloaded to support different combinations of payload and handler.
 *
 * @param type The action type string (e.g., 'ADD_USER').
 * @param handler Optional reducer handler for this action. Used in overloads.
 * @param payloadCreator Optional function to generate payload from arguments. Used in overloads.
 * @returns An action creator function.
 */
export function createAction<TType extends string>(type: TType): ActionCreator<void, TType, []>;
export function createAction<TType extends string, TState>(
  type: TType,
  handler: ActionHandler<TState, void>
): ActionCreator<void, TType, []>;
export function createAction<TType extends string, TPayload>(
  type: TType,
  handler: ActionHandler<any, TPayload>
): ActionCreator<TPayload, TType, [TPayload]>;
export function createAction<TType extends string, TArgs extends readonly any[], TPayload>(
  type: TType,
  handler: ActionHandler<any, TPayload>,
  payloadCreator: (...args: TArgs) => TPayload
): ActionCreator<TPayload, TType, TArgs>;

/**
 * Implementation of createAction.
 * @internal
 */
export function createAction<TType extends string, TArgs extends readonly any[] = [], TPayload = void>(
  type: TType,
  handler: ActionHandler<any, TPayload> = (() => void 0) as ActionHandler<any, TPayload>,
  payloadCreator?: (...args: TArgs) => TPayload
): ActionCreator<TPayload, TType, TArgs> {
  const defaultPayloadCreator = ((...args: any[]) => (args.length > 0 ? args[0] : undefined)) as (...args: TArgs) => TPayload;
  const actualPayloadCreator = payloadCreator ?? defaultPayloadCreator;

  const creator = (...args: TArgs): Action<TPayload> => {
    const payload = actualPayloadCreator(...args);
    const action: Action<TPayload> = { type };

    if (payload !== undefined) {
      action.payload = payload;
      if (payload !== null && typeof payload === 'object') {
        if ('meta' in payload) action.meta = (payload as any).meta;
        if ('error' in payload) action.error = (payload as any).error;
      }
    }

    return action;
  };

  return Object.assign(creator, {
    handler,
    type,
    toString: () => type,
    match: (action: Action<any>): action is Action<TPayload> => action?.type === type,
  }) as ActionCreator<TPayload, TType, TArgs>;
}

/**
 * Creates an asynchronous thunk action creator function.
 *
 * A thunk is a function that can perform asynchronous logic and dispatch
 * multiple actions before and/or after its asynchronous operations complete.
 *
 * This version also supports "triggers" — action types or matcher functions
 * that, when matched by any dispatched action, will cause this thunk to be
 * executed automatically.
 *
 * @template T - The string literal type of the thunk's action type.
 * @template ThunkBody - The type of the thunk function (AsyncAction).
 * @template Args - The argument tuple type accepted by the thunk creator.
 *
 * @param type - The action type string for the thunk (used for matching and debugging).
 * @param thunkBodyCreator - A factory function that receives the thunk's arguments
 *   and returns the actual thunk body function to execute.
 * @param triggers - Optional list of trigger definitions. Each trigger can be:
 *   - a string action type to match exactly, or
 *   - a matcher function that receives the dispatched action and returns `true` if the thunk should run.
 *
 * @returns A thunk creator function. Calling this function with arguments will
 *   return a thunk function with attached metadata:
 *   - `type`: the action type string
 *   - `match(action)`: checks if the given action matches this thunk's type
 *   - `isThunk`: `true` for identification in middleware
 *   - `triggers`: (optional) the list of trigger definitions
 */
export function createThunk<TType extends string, TArgs extends readonly any[] = []>(
  type: TType,
  thunkBodyCreator: (...args: TArgs) => AsyncAction<any, any>,
  triggers?: ReadonlyArray<ThunkTrigger>
): ThunkCreator<TType, any, any, TArgs>;
export function createThunk<
  TType extends string,
  TState = any,
  TDependencies = any,
  TArgs extends readonly any[] = []
>(
  type: TType,
  thunkBodyCreator: (...args: TArgs) => AsyncAction<TState, TDependencies>,
  triggers?: ReadonlyArray<ThunkTrigger>
): ThunkCreator<TType, TState, TDependencies, TArgs> {
  const match = (action: unknown): action is Action<any> =>
    isAction(action) && action.type === type;

  const thunkCreator = ((...args: TArgs) => {
    const thunk = thunkBodyCreator(...args);

    const wrappedThunk: AsyncAction<TState, TDependencies> = async (
      dispatch,
      getState,
      dependencies
    ) => {
      try {
        await thunk(dispatch, getState, dependencies);
      } catch (error: any) {
        const message = error?.message ?? String(error);
        console.warn(`Error in thunk action "${type}": ${message}.`);
        throw error;
      }
    };

    const thunkWithProps = Object.assign(wrappedThunk, {
      type,
      toString: () => type,
      match,
      isThunk: true as const,
      ...(triggers?.length ? { triggers } : {}),
    });

    return thunkWithProps as ThunkAction<TState, TDependencies>;
  }) as ThunkCreator<TType, TState, TDependencies, TArgs>;

  return Object.assign(thunkCreator, {
    type,
    toString: () => type,
    match,
    isThunk: true as const,
    ...(triggers?.length ? { triggers } : {}),
  });
}

/**
 * Binds a single action creator to the dispatch function.
 *
 * @param actionCreator The action creator function.
 * @param dispatch The dispatch function.
 * @returns A function that dispatches the action created by the action creator.
 */
export function bindActionCreator(actionCreator: Function, dispatch: Function): Function {
  return function (this: any, ...args: any[]): any {
    return dispatch(actionCreator.apply(this, args));
  };
}

/**
 * Binds multiple action creators to the dispatch function.
 *
 * @param actionCreators An object of action creators or a single action creator function.
 * @param dispatch The dispatch function.
 * @returns An object of bound action creators or a single bound action creator function.
 */
export function bindActionCreators(
  actionCreators: Record<string, Function> | Function,
  dispatch: Function
): any {
  if (typeof actionCreators === 'function') {
    return bindActionCreator(actionCreators, dispatch);
  }

  if (typeof actionCreators !== 'object' || actionCreators === null) {
    console.warn(
      `bindActionCreators expected an object or a function, but received: '${Object.prototype.toString.call(
        actionCreators
      )}'.`
    );
    return undefined;
  }

  const boundActionCreators: Record<string, Function> = {};

  for (const key in actionCreators) {
    const actionCreator = actionCreators[key];
    if (typeof actionCreator === 'function') {
      boundActionCreators[key] = bindActionCreator(actionCreator, dispatch);
    }
  }

  return boundActionCreators;
}
