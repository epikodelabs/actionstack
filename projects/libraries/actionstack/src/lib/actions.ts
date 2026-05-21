import { isAction } from './types';
import type { Action, ActionCreator, ActionHandler, ActionRegistry, AsyncAction, FeatureModule, ThunkCreator, ThunkAction, ThunkTrigger } from './types';

export { createAction as action, createThunk as thunk };

/**
 * Creates a fresh, isolated action registry for a store instance.
 * Keeping registries per-store prevents collisions when multiple stores exist.
 */
export function createActionRegistry(): ActionRegistry {
  return {
    actionHandlers: new Map<string, ActionHandler>(),
    registeredThunks: new Map<string, ThunkCreator>(),
  };
}

/**
 * Returns an array of all registered thunk creators.
 *
 * Thunks are asynchronous action creators that can be automatically
 * invoked by the middleware when their corresponding actions are dispatched.
 *
 * @returns {ThunkCreator<any, any, any>[]} Array of registered thunk creators.
 */
export const getRegisteredThunks = (registry: ActionRegistry) => Array.from(registry.registeredThunks.values());

/**
 * Retrieves the registered handler function for a specific action type.
 *
 * @param {string} type - The action type to look up.
 * @param {ActionRegistry} registry - The store's action registry.
 * @returns {Function | undefined} The handler function associated with the action type, or `undefined` if none is registered.
 */
export const getActionHandlers = (type: string, registry: ActionRegistry) => registry.actionHandlers.get(type);

/**
 * Registers all action handlers defined in a feature module into the store's action handler map.
 *
 * This function iterates over the module's actions and adds their handlers to the
 * registry used for dispatching. If a handler is already registered for the same action type,
 * a warning is logged and the existing handler is preserved.
 *
 * @param module - The feature module containing actions with associated handlers.
 * @param registry - The store's action registry.
 */
export const registerActionHandlers = (module: FeatureModule, registry: ActionRegistry) => {
  Object.values(module.actions).forEach((action: any) => {
    if (action.type && registry.actionHandlers.has(action.type)) {
      console.warn(
        `Action handler for "${action.type}" already registered - preserving existing handler`
      );
    } else if (action.type) {
      registry.actionHandlers.set(action.type, action.handler);
    }
  });
};

/**
 * Unregisters all action handlers associated with a feature module.
 *
 * This function removes the module's action handlers from the registry,
 * effectively disabling those actions from being handled after the module is destroyed.
 *
 * @param module - The feature module whose action handlers should be removed.
 * @param registry - The store's action registry.
 */
export const unregisterActionHandlers = (module: FeatureModule, registry: ActionRegistry) => {
  Object.values(module.actions).forEach((action: any) => {
    if (action.type && registry.actionHandlers.has(action.type)) {
      registry.actionHandlers.delete(action.type);
    }
  });
};

/**
 * Registers all thunks defined in a feature module into the store's thunk registry.
 *
 * This allows the store's middleware to automatically invoke thunks
 * when their `triggers` match a dispatched action.
 *
 * If a thunk is already registered under the same type, a warning is logged and the
 * existing thunk is preserved.
 *
 * @param module - The feature module containing thunks to be registered.
 * @param registry - The store's action registry.
 */
export const registerThunks = (module: FeatureModule, registry: ActionRegistry) => {
  const sourceActions = (module as any).__rawActions ?? module.actions;
  Object.values(sourceActions || {}).forEach((thunk: any) => {
    if (thunk.isThunk && thunk.type) {
      if (registry.registeredThunks.has(thunk.type)) {
        console.warn(
          `Thunk "${thunk.type}" already registered - preserving existing thunk`
        );
        return;
      }

      registry.registeredThunks.set(thunk.type, thunk);
    }

  });
};

/**
 * Unregisters all thunks associated with a feature module.
 *
 * This removes the module's thunks from the registry,
 * preventing them from being triggered automatically after
 * the module is destroyed.
 *
 * @param module - The feature module whose thunks should be removed.
 * @param registry - The store's action registry.
 */
export const unregisterThunks = (module: FeatureModule, registry: ActionRegistry) => {
  const sourceActions = (module as any).__rawActions ?? module.actions;
  Object.values(sourceActions || {}).forEach((thunk: any) => {
    if (thunk.isThunk && thunk.type && registry.registeredThunks.has(thunk.type)) {
      registry.registeredThunks.delete(thunk.type);
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
