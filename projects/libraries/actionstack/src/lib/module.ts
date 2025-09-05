import {
  createReplaySubject,
  createSubject,
  switchMap,
  takeUntil
} from '@actioncrew/streamix';
import {
  ActionCreator,
  FeatureModule,
  isAction,
  Store,
  Streams,
} from '../lib';

/**
 * Creates a feature module that encapsulates a slice of state, its actions, selectors,
 * dependencies, and reactive data streams.
 *
 * Feature modules can be configured with a store instance via `.configure(store)` and
 * expose strongly-typed actions and selectors. Data streams (`data$`) are deferred until
 * the module is loaded, and stop emitting when the module is destroyed.
 *
 * @template State The type of the module's state slice.
 * @template ActionTypes The union type of action string constants for this module.
 * @template Actions The shape of the module's action creators and/or thunks.
 * @template Selectors The shape of the module's selector factories.
 * @template Dependencies The shape of any dependencies injected into the module.
 *
 * @param {object} config Module configuration.
 * @param {string} config.slice The unique path identifying this module in the store state.
 * @param {State} config.initialState The initial state of the module slice.
 * @param {Actions} [config.actions] Optional set of action creators or thunks.
 * @param {Selectors} [config.selectors] Optional set of selector factories for derived data.
 * @param {Dependencies} [config.dependencies] Optional dependency objects to inject into thunks.
 * @returns {FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>} A fully configured module instance.
 */
function createModule<
  State,
  ActionTypes extends string,
  Actions extends Record<string, ActionCreator<ActionTypes> | ((...args: any[]) => any)>,
  Selectors extends Record<string, (...args: any[]) => (state: State) => any>,
  Dependencies extends Record<string, any> = {}
>(config: {
  slice: string;
  initialState: State;
  actions?: Actions;
  selectors?: Selectors;
  dependencies?: Dependencies;
}) {
  const { slice } = config;
  const pathParts = slice.split('/');

  // Helper to select nested slice
  function selectSlice(rootState: any) {
    return pathParts.reduce((s, key) => (s ? s[key] : undefined), rootState);
  }

  let configured = false;
  const loaded$ = createReplaySubject<void>();
  const destroyed$ = createSubject<void>();

  const processedActions = processActions(config.actions ?? {}, slice, config.dependencies);
  const processedSelectors = processSelectors(config.selectors ?? {}, selectSlice);
  let store: Store<State> | undefined;

  const module = {
    slice,
    initialState: config.initialState,
    actions: {} as Actions,
    selectors: processedSelectors,
    dependencies: config.dependencies,
    data$: {} as Streams<Selectors>,
    loaded$,
    destroyed$,

    configure(storeInstance: Store<State>) {
      if (configured) return this;
      configured = true;
      store = storeInstance;
      return this;
    }
  };

  // Initialize data$ streams and actions immediately, but they'll defer to store availability
  initializeDataStreams(module, processedSelectors, loaded$, destroyed$, () => store);
  initializeActions(module, processedActions, slice, () => store);

  return module as FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>;
}


/**
 * Processes a set of actions and thunks for a module by namespacing them with the module slice.
 * 
 * - Standard action creators are converted to namespaced types.
 * - Thunks are wrapped to receive injected dependencies and are tagged with `isThunk`.
 *
 * @template Actions The shape of the original module actions.
 * @param {Actions} actions Original action creators or thunks.
 * @param {string} slice The module slice path used to namespace actions.
 * @param {Record<string, any>} [dependencies={}] Optional dependencies to inject into thunks.
 * @returns {Actions} The processed actions with namespaced types and thunk wrappers.
 */
function processActions<Actions extends Record<string, any>>(
  actions: Actions,
  slice: string,
  dependencies: Record<string, any> = {}
): Actions {
  const processed = {} as Actions;

  for (const [name, action] of Object.entries(actions)) {
    if (isActionCreator(action)) {
      const namespacedType = `${slice}/${action.type}`;
      const namespacedAction = (...args: any[]) => {
        const act = action(...args);
        return {
          ...act,
          type: namespacedType,
        };
      };

      Object.assign(namespacedAction, action, {
        type: namespacedType,
        toString: () => namespacedType,
      });

      (processed as any)[name] = namespacedAction;
    } else {
      let thunkWithType = (...args: any[]) => {
        const thunk = action(...args);
        return Object.assign(
          async (dispatch: any, getState: any, deps: any) => {
            return thunk(dispatch, getState, {
              ...deps,
              ...dependencies,
            });
          },
          {
            type: `${slice}/${name}`,
            isThunk: true,
            toString: () => `${slice}/${name}`,
            match: (action: any) => isAction(action) && action.type === `${slice}/${name}`
          }
        );
      };

      thunkWithType = Object.assign(thunkWithType, {
        type: `${slice}/${name}`,
        isThunk: true,
        toString: () => `${slice}/${name}`,
        match: (action: any) => isAction(action) && action.type === `${slice}/${name}`,
        triggers: action.triggers?.map((t: string) =>
          t.includes('/') ? t : `${slice}/${t}`
        )
      });

      (processed as any)[name] = thunkWithType;
    }
  }

  return processed;
}

/**
 * Processes selector factories by binding them to the module slice.
 *
 * Each processed selector is a function that, when called, returns a selector that operates
 * on the slice of state managed by the module.
 *
 * @template State The module state type.
 * @template Selectors The shape of the selector factories.
 * @param {Selectors} selectors Original selector factories.
 * @param {(rootState: any) => State} selectSlice Function to extract the module slice from the root state.
 * @returns {Selectors} The processed selectors bound to the module slice.
 */
function processSelectors<
  State,
  Selectors extends Record<string, (...args: any[]) => (state: State) => any>
>(
  selectors: Selectors,
  selectSlice: (rootState: any) => State
): Selectors {
  const processed = {} as Selectors;

  for (const [name, selectorFactory] of Object.entries(selectors)) {
    (processed as any)[name] = (...args: any[]) => {
      const baseSelector = selectorFactory(...args);
      return (rootState: any) => {
        const sliceState = selectSlice(rootState);
        return baseSelector(sliceState);
      };
    };
  }

  return processed;
}

/**
 * Initializes reactive data streams (`data$`) for all module selectors.
 *
 * Streams are deferred until the module's `loaded$` emits, and automatically stop
 * when `destroyed$` emits. Each stream uses the store's `.select()` method at runtime.
 *
 * @template State Module state type.
 * @template Selectors Shape of the processed selectors.
 * @param {any} moduleInstance The module object being initialized.
 * @param {Selectors} processedSelectors Processed selector factories.
 * @param {import('@actioncrew/streamix').ReplaySubject<void>} loaded$ Emits when the module is fully loaded.
 * @param {import('@actioncrew/streamix').Subject<void>} destroyed$ Emits when the module is destroyed.
 * @param {() => Store<State> | undefined} getStore Function that returns the store instance.
 */
function initializeDataStreams<
  State,
  Selectors extends Record<string, (...args: any[]) => (state: State) => any>
>(
  moduleInstance: any,
  processedSelectors: Selectors,
  loaded$: any,
  destroyed$: any,
  getStore: () => Store<State> | undefined
) {
  // Create the data$ functions that return deferred streams
  for (const key in processedSelectors) {
    const factory = processedSelectors[key];
    (moduleInstance.data$ as any)[key] = (...args: any[]) => {
      return loaded$.pipe(
        switchMap(() => {
          // Access store via getter at runtime
          const store = getStore();
          if (!store) {
            throw new Error(`Module "${moduleInstance.slice}" store not available for data$ streams`);
          }
          const selectorFn = factory(...args);
          return store.select(selectorFn);
        }),
        takeUntil(destroyed$) // stop emitting if module is destroyed
      );
    };
  }
}

/**
 * Initializes module actions to dispatch through the store.
 *
 * Each action creator is wrapped to dispatch automatically when called,
 * throwing an error if the module is not configured with a store yet.
 *
 * @template Actions Shape of the processed actions.
 * @param {any} moduleInstance The module object being initialized.
 * @param {Actions} processedActions Actions or thunks processed with `processActions`.
 * @param {string} slice The module slice path used for namespacing.
 * @param {() => Store<any> | undefined} getStore Function that returns the store instance.
 */
function initializeActions<Actions extends Record<string, any>>(
  moduleInstance: any,
  processedActions: Actions,
  slice: string,
  getStore: () => Store<any> | undefined
) {
  for (const key in processedActions) {
    const actionCreator = processedActions[key];

    (moduleInstance.actions as any)[key] = (...args: any[]) => {
      // Access store via getter at runtime
      const store = getStore();
      if (!store) {
        throw new Error(
          `Module "${slice}" actions cannot be dispatched before configuration. ` +
          `Call module.configure(store) first.`
        );
      }

      const actionToDispatch = actionCreator(...args);
      store.dispatch(actionToDispatch);
      return actionToDispatch;
    };

    // Preserve metadata from original function (e.g. type)
    Object.defineProperties(
      (moduleInstance.actions as any)[key],
      Object.getOwnPropertyDescriptors(actionCreator)
    );
  }
}

/**
 * Determines if the provided object is a standard action creator (not a thunk).
 *
 * A standard action creator must have a `type` property of type string
 * and must not be marked as a thunk (`isThunk !== true`).
 *
 * @param {any} obj The object to check.
 * @returns {obj is ActionCreator} True if the object is a standard action creator.
 */
function isActionCreator(obj: any): obj is ActionCreator {
  return obj && typeof obj.type === 'string' && obj?.isThunk !== true;
}

/**
 * Registers one or more modules into the store.
 *
 * - If multiple modules are provided, calls `store.populate()` for batch registration.
 * - If a single module is provided, calls `store.loadModule()` to initialize it.
 *
 * @template State Module state type.
 * @template ActionTypes Action string union.
 * @template Actions Shape of module actions.
 * @template Selectors Shape of module selectors.
 * @template Dependencies Shape of module dependencies.
 * @param {Store<State>} store The store instance where modules are registered.
 * @param {FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>} module Module to register.
 * @returns {void}
 */
function registerModule<
  State,
  ActionTypes extends string,
  Actions extends Record<string, ActionCreator<ActionTypes> | ((...args: any[]) => any)>,
  Selectors extends Record<string, (...args: any[]) => (state: State) => any>,
  Dependencies extends Record<string, any> = {}
>(store: Store<State>, module: FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>) {
  store.loadModule(module);
  return module;
}

/**
 * Unregisters one or more modules from the store.
 *
 * - Calls `store.unloadModule()` for each module.
 * - Optionally clears the module's state from the store.
 *
 * @template State Module state type.
 * @template ActionTypes Action string union.
 * @template Actions Shape of module actions.
 * @template Selectors Shape of module selectors.
 * @template Dependencies Shape of module dependencies.
 * @param {Store<State>} store The store instance.
 * @param {boolean} [clearState=true] Whether to clear the module's state from the store.
 * @param {FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>} module Module to unregister.
 */
function unregisterModule<
  State,
  ActionTypes extends string,
  Actions extends Record<string, any>,
  Selectors extends Record<string, any>,
  Dependencies extends Record<string, any>
>(
  store: Store<State>,
  module: FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>,
  clearState: boolean = true
) {
  store.unloadModule(module, clearState);
  return module;
}

function populateStore<
  State,
  ActionTypes extends string,
  Actions extends Record<string, any>,
  Selectors extends Record<string, any>,
  Dependencies extends Record<string, any>
>(
  store: Store<State>,
  ...modules: FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>[]
) {
  store.populate(...modules);
  return modules;
}

export { createModule, registerModule, unregisterModule, populateStore };
