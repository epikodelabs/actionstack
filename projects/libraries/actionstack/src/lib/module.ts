import {
  createAsyncIterator,
  createReceiver,
  createReplaySubject,
  createSubscription,
  createSubject,
  firstValueFrom,
  pipeSourceThrough,
  streamToArray,
  switchMap,
  takeUntil
} from '@epikodelabs/streamix';
import { isAction } from '../lib';
import type { ActionCreator, FeatureModule, Store, Streams, AsyncAction, Selector } from '../lib';

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
 * @template Selectors The shape of the module's selectors.
 * @template Dependencies The shape of any dependencies injected into the module.
 *
 * @param {object} config Module configuration.
 * @param {string} config.slice The unique path identifying this module in the store state.
 * @param {State} config.initialState The initial state of the module slice.
 * @param {Actions} [config.actions] Optional set of action creators or thunks.
 * @param {Selectors} [config.selectors] Optional set of selectors for derived data.
 * @param {Dependencies} [config.dependencies] Optional dependency objects to inject into thunks.
 * @returns {FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>} A fully configured module instance.
 */
function createModule<
  State,
  ActionTypes extends string,
  Actions extends Record<string, ActionCreator<ActionTypes> | ((...args: any[]) => any)>,
  Selectors extends Record<string, (state: State) => any>,
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
  let loaded$ = createReplaySubject<void>();
  let destroyed$ = createSubject<void>();
  let destroyed = false;

  const processedActions = processActions(config.actions ?? {}, slice, config.dependencies);
  const processedSelectors = processSelectors(
    config.selectors ?? {},
    selectSlice
  );
  let store: Store<any> | undefined;

  const module = {
    slice,
    initialState: config.initialState,
    dependencies: config.dependencies,
    __rawActions: processedActions,
    loaded$,
    destroyed$,
    data$: {} as Streams<Selectors>,
    actions: {} as Actions,
    selectors: processedSelectors as any,

    init(storeInstance: Store<any>) {
      return this.configure(storeInstance);
    },

    configure(storeInstance: Store<any>) {
      if (configured) return this;
      configured = true;
      destroyed = false;
      store = storeInstance;

      // Initialize data$ streams and actions with the store
      initializeActions(this, processedActions, slice, () => store);

      return this;
    },

    destroy(clearState?: boolean) {
      destroyed = true;
      destroyed$.next();
      destroyed$.complete();
      loaded$.complete();

      if (store && clearState !== false) {
        store.unloadModule(this, true);
      }

      configured = false;
      store = undefined;
      loaded$ = createReplaySubject<void>();
      destroyed$ = createSubject<void>();
      (this as any).loaded$ = loaded$;
      (this as any).destroyed$ = destroyed$;

      return this;
    }
  };

  initializeDataStreams(module, processedSelectors, () => loaded$, () => destroyed$, () => destroyed, () => store);

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
        match: (act: any) => isAction(act) && act.type === namespacedType
      });

      (processed as any)[name] = namespacedAction;
    } else {
      const originalType =
        typeof action?.type === 'string' ? action.type : name;
      const namespacedType = originalType.includes('/')
        ? originalType
        : `${slice}/${originalType}`;

      const thunkWithType = (...args: any[]) => {
        const thunk = action(...args);
        return Object.assign(
          async (dispatch: any, getState: any, deps: any) => {
            return thunk(dispatch, getState, {
              ...deps,
              ...dependencies,
            });
          },
          {
            type: namespacedType,
            isThunk: true,
            toString: () => namespacedType,
            match: (act: any) => isAction(act) && act.type === namespacedType
          }
        );
      };

      Object.assign(thunkWithType, {
        type: namespacedType,
        isThunk: true,
        toString: () => namespacedType,
        match: (act: any) => isAction(act) && act.type === namespacedType,
        triggers: action.triggers?.map((t: any) =>
          typeof t === 'string' ? (t.includes('/') ? t : `${slice}/${t}`) : t
        )
      });

      (processed as any)[name] = thunkWithType;
    }
  }

  return processed;
}

/**
 * Processes slice-level selectors and transforms them into root-level selectors.
 *
 * @template SliceState The module state type.
 * @template Selectors The shape of the selectors.
 * @param {Selectors} selectors Original slice-level selectors.
 * @param {(rootState: any) => SliceState} selectSlice Function to extract the module slice from the root state.
 * @returns {Selectors} The processed selectors bound to the module slice.
 */
function processSelectors<
  SliceState,
  Selectors extends Record<string, Selector<SliceState, any>>
>(
  selectors: Selectors,
  selectSlice: (rootState: any) => SliceState
): { [K in keyof Selectors]: Selector<any, ReturnType<Selectors[K]>> } {
  const processed: any = {};

  for (const [name, sliceSelector] of Object.entries(selectors)) {
    if (typeof sliceSelector !== 'function') {
      throw new Error(`Selector "${name}" must be a function.`);
    }

    if (sliceSelector.length === 0) {
      throw new Error(
        `Selector "${name}" must accept slice state directly. Selector factories are not supported.`
      );
    }

    const rootSelector = (rootState: any) =>
      sliceSelector(selectSlice(rootState));
    
    processed[name] = rootSelector;
  }

  return processed;
}

/**
 * Initializes reactive data streams (`data$`) for all module selectors.
 *
 * Streams are available as soon as the module is created. When the module has not
 * been configured yet, each selector stream waits for `loaded$` before attaching
 * to the store, and automatically stops when `destroyed$` emits.
 *
 * @template State Module state type.
 * @template Selectors Shape of the processed selectors.
 * @param {any} moduleInstance The module object being initialized.
 * @param {Selectors} processedSelectors Processed selectors.
 * @param {() => import('@epikodelabs/streamix').ReplaySubject<void>} getLoaded$ Returns the current loaded stream.
 * @param {() => import('@epikodelabs/streamix').Subject<void>} getDestroyed$ Returns the current destroyed stream.
 * @param {() => boolean} isDestroyed Returns whether the module has been destroyed.
 * @param {() => Store<State> | undefined} getStore Function that returns the store instance.
 */
function initializeDataStreams<
  State,
  Selectors extends Record<string, (rootState: any) => any>
>(
  moduleInstance: any,
  processedSelectors: Selectors,
  getLoaded$: () => any,
  getDestroyed$: () => any,
  isDestroyed: () => boolean,
  getStore: () => Store<State> | undefined
) {
  for (const key in processedSelectors) {
    const selectorFn = processedSelectors[key];

    const unavailableStream = () =>
      createErrorStream(
        new Error(
          `Module "${moduleInstance.slice}" store not available for data$ streams`
        )
      );

    // ✅ data$.key() — zero args
    (moduleInstance.data$ as any)[key] = () => {
      const store = getStore();
      const destroyed$ = getDestroyed$();

      if (!store && isDestroyed()) {
        return unavailableStream();
      }

      if (store) {
        return store.select(selectorFn).pipe(
          takeUntil(destroyed$)
        );
      }

      const loaded$ = getLoaded$();
      return loaded$.pipe(
        switchMap(() => {
          const nextStore = getStore();
          if (!nextStore) {
            return unavailableStream();
          }

          return nextStore.select(selectorFn);
        }),
        takeUntil(destroyed$)
      );
    };
  }
}

function createErrorStream(error: unknown): any {
  const subscribe = (callbackOrReceiver?: any) => {
    const receiver = createReceiver(callbackOrReceiver);
    void receiver.error(error);
    return createSubscription();
  };

  let stream: any;
  stream = {
    type: 'stream',
    name: 'error',
    pipe: ((...ops: any[]) => pipeSourceThrough(stream, ops)) as any,
    subscribe,
    query: () => firstValueFrom(stream),
    toArray: () => streamToArray(stream),
    [Symbol.asyncIterator]: () => {
      const factory = createAsyncIterator<any>({
        register: (receiver) => subscribe(receiver),
      });
      return factory();
    },
  };

  return stream;
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
 * @param {...FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>} modules One or more modules to register.
 * @returns {FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>[]} The modules that were passed in.
 */
function registerModule<
  State,
  ActionTypes extends string,
  Actions extends Record<string, ActionCreator<ActionTypes> | ((...args: any[]) => any)>,
  Selectors extends Record<string, (state: State) => any>,
  Dependencies extends Record<string, any> = {}
>(store: Store<any>, ...modules: FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>[]) {
  if (modules.length === 0) return modules;

  if (modules.length === 1) {
    store.loadModule(modules[0]);
  } else {
    store.populate(...modules);
  }

  return modules;
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
 * @param {...(FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies> | boolean)} modulesOrClearState Modules to unregister, with an optional `clearState` boolean as the first or last argument.
 * @returns {FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>[]} The modules that were passed in (excluding the clearState flag).
 */
function unregisterModule<
  State,
  ActionTypes extends string,
  Actions extends Record<string, any>,
  Selectors extends Record<string, any>,
  Dependencies extends Record<string, any>
>(
  store: Store<any>,
  ...modulesOrClearState: Array<FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies> | boolean>
) {
  if (modulesOrClearState.length === 0) return [];

  let clearState = true;
  if (typeof modulesOrClearState[0] === 'boolean') {
    clearState = modulesOrClearState.shift() as boolean;
  }
  if (modulesOrClearState.length && typeof modulesOrClearState[modulesOrClearState.length - 1] === 'boolean') {
    clearState = modulesOrClearState.pop() as boolean;
  }

  const modules = modulesOrClearState as FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>[];

  modules.forEach((module) => {
    store.unloadModule(module, clearState);
  });

  return modules;
}

function populateStore<
  State,
  ActionTypes extends string,
  Actions extends Record<string, any>,
  Selectors extends Record<string, any>,
  Dependencies extends Record<string, any>
>(
  store: Store<any>,
  ...modules: FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>[]
) {
  store.populate(...modules);
  return modules;
}

export { createModule, registerModule, unregisterModule, populateStore };
