import type { Atom } from '@epikodelabs/streamix';
import { MutationBatch, type StatePath } from './mutations';
import { createSelectorRegistry } from './tracked-selectors';
import { action, createActionRegistry, getActionHandlers, registerActionHandlers, registerThunks, unregisterActionHandlers, unregisterThunks } from './actions';
import { waitForBrowserIdle } from './idle';
import { createModule, registerModule } from './module';
import { createQueue } from './queue';
import { starter } from './starter';
import type {
    Action,
    AsyncAction,
    AsyncReducer,
    Dispatch,
    FeatureModule,
    Middleware,
    MiddlewareAPI,
    Reducer,
    StoreEnhancer,
} from './types';
import {
    combineEnhancers,
    getProperty,
} from './utils';

/**
 * Class representing configuration options for a store.
 * This class defines properties that control various behaviors of a store for managing application state.
 */
export type StoreSettings = {
  awaitStatePropagation?: boolean;
  dispatchSystemActions?: boolean;
  enableGlobalReducers?: boolean;
  exclusiveActionProcessing?: boolean;
};

/**
 * The default settings for the store that configure various behaviors such as action dispatch
 * and reducer handling.
 */
const defaultStoreSettings: StoreSettings = {
  awaitStatePropagation: false,
  dispatchSystemActions: true,
  enableGlobalReducers: true,
  exclusiveActionProcessing: false,
};

/**
 * The `Store` type represents the core store object that manages state, actions, and modules.
 * It provides methods to interact with the store's state, dispatch actions, load/unload modules, and more.
 */
export type Store<TState = any, TDependencies = any> = {
    dispatch: Dispatch<TState, TDependencies>;

    getState: {
        <R = any>(slice: '*', callback: (state: Readonly<TState>) => void): Promise<void>;
        <R = any>(slice: string, callback: (state: Readonly<R>) => void): Promise<void>;
        <R = any>(slice: readonly string[], callback: (state: Readonly<R>) => void): Promise<void>;
    };

    select: {
        // The Promise overload must come first: TypeScript tries overloads in
        // order, and an async selector otherwise infers Atom<Promise<T>> against
        // this runtime's Atom<T> emissions.
        <R = any>(selector: (state: Readonly<TState>) => Promise<R>, defaultValue?: R): Atom<R>;
        <R = any>(selector: (state: Readonly<TState>) => R, defaultValue?: R): Atom<R>;
    };

    populate: (...modules: FeatureModule[]) => Promise<void>;
    loadModule: (module: FeatureModule) => Promise<void>;
    unloadModule: (module: FeatureModule, clearState?: boolean) => Promise<void>;

    addReducer: (reducer: (state: TState, action: Action<any> | AsyncAction<TState, TDependencies>) => TState | void | Promise<TState | void>) => void;

    middlewareAPI: MiddlewareAPI;
    starter: Middleware;
};

interface SystemState {
  _initialized: boolean;
  _ready: boolean;
  _modules: string[];
}

/**
 * Checks whether an action type belongs to the internal system namespace.
 *
 * @param type - Action type string to check.
 * @returns True when the type starts with "system/".
 */
export function isSystemActionType(type: string): boolean {
  return typeof type === 'string' && type.startsWith('system/');
}

function createSystemModule() {
  return createModule({
    slice: 'system',
    initialState: {
      _initialized: false,
      _ready: false,
      _modules: [],
    } as SystemState,
    actions: {
      initializeState: action('INITIALIZE_STATE', (_state: SystemState) => ({
        _modules: [],
        _initialized: false,
        _ready: false,
      })),

      updateState: action(
        'UPDATE_STATE',
        (state: SystemState, payload: Partial<SystemState>) => ({
          ...(state ?? ({} as any)),
          ...payload,
        })
      ),

      storeInitialized: action('STORE_INITIALIZED', (state: SystemState) => ({
        ...(state ?? ({} as any)),
        _initialized: true,
        _ready: true,
      })),

      moduleLoaded: action(
        'MODULE_LOADED',
        (state: SystemState, payload: { slice: string }) => ({
          ...(state ?? ({ _modules: [] } as any)),
          _modules: [...(state?._modules ?? []), payload.slice],
        })
      ),

      moduleUnloaded: action(
        'MODULE_UNLOADED',
        (state: SystemState, payload: { slice: string }) => ({
          ...(state ?? ({ _modules: [] } as any)),
          _modules: (state?._modules ?? []).filter((m) => m !== payload.slice),
        })
      ),
    },
    selectors: {
      isInitialized: (state: SystemState) => state._initialized,
      isReady: (state: SystemState) => state._ready,
      loadedModules: (state: SystemState) => state._modules,
    },
    dependencies: {},
  });
}

/**
 * Creates a new store instance.
 *
 * This function initializes a store with the provided `mainModule` configuration and optional store enhancer.
 * It also accepts store settings that define various configuration options for the store.
 * The `storeSettings` parameter defaults to `defaultStoreSettings` if not provided.
 */
export function createStore<T = any>(
  storeSettingsOrEnhancer?: StoreSettings | StoreEnhancer,
  enhancer?: StoreEnhancer
): Store<T> {
  const systemModule = createSystemModule();
  let modules: FeatureModule[] = [];
  let sysActions = systemModule.actions;
  let reducers: (Reducer | AsyncReducer)[] = [];
  const registry = createActionRegistry();

  // Determine if the second argument is storeSettings or enhancer
  let settings: StoreSettings;
  if (typeof storeSettingsOrEnhancer === 'function') {
    // If it's a function, it's the enhancer
    enhancer = storeSettingsOrEnhancer;
    settings = defaultStoreSettings; // Use default settings if not provided
  } else {
    // Otherwise, it's storeSettings
    settings = { ...defaultStoreSettings, ...storeSettingsOrEnhancer };
  }

  // Configure store pipeline
  let pipeline = {
    dependencies: {},
    strategy: settings.exclusiveActionProcessing ? 'exclusive' : 'concurrent',
  };

  let state = {} as T;
  const selectors = createSelectorRegistry(() => state);
  let propagation: Promise<void> = Promise.resolve();
  const publish = (changes: StatePath[]): void => {
    if (!changes.length) return;
    let completion: Promise<void>;
    try { completion = selectors.notify(changes); } catch (error) {
      console.warn('Error propagating state to selectors:', error);
      return;
    }
    propagation = Promise.all([propagation, completion]).then(() => undefined).catch(error => {
      console.warn('Error propagating state to selectors:', error);
    });
  };
  const queue = createQueue();

  /**
   * Dispatches an action to update the global state.
   *
   * The function validates the action to ensure it is a plain object with a defined and string type property.
   * If any validation fails, a warning is logged to the console and the action is not dispatched.
   * After validation, the action is processed by the reducer, and the global state is updated accordingly.
   */
  let dispatch: Dispatch<T, any> = async (action: Action | AsyncAction<T, any>): Promise<any> => {
    if (typeof action === 'function') {
      return await (action as AsyncAction<T, any>)(
        (nestedAction: Action | AsyncAction<T, any>): Promise<any> => store.dispatch(nestedAction as any),
        () => state,
        pipeline.dependencies
      );
    }

    if (!action || typeof action !== 'object' || typeof (action as any).type !== 'string') {
      console.warn('Invalid action dispatched:', action);
      return;
    }

    // Starter middleware already serializes this transaction through the store queue.
    const batch = new MutationBatch(state);
    const handler = getActionHandlers(action.type, registry);

    if (handler) {
      const slicePath = action.type.split('/').slice(0, -1); // handles 'foo/bar/ACTION'
      await batch.run(slicePath, draft => handler(draft, action.payload));
    }

    if (reducers?.length) {
      for (let i = reducers.length - 1; i >= 0; i--) {
        try {
          const reducer = reducers[i];
          await batch.run([], draft => reducer(draft, action));
        } catch (err: any) {
          console.warn(`Error in meta-reducer ${i}:`, err.message ?? err);
        }
      }
    }

    // Emit only once after all reducers have run
    if (batch.changes.length) {
      state = batch.commit();
      publish(batch.changes);
    }
  };

  /**
   * Recursively processes a nested structure of dependencies, handling arrays, objects, and class instances.
   *
   * @param {any} source The source object to process.
   * @param {Object} processed The object to accumulate processed values.
   * @param {string} origin The origin of the current source object (e.g., module name).
   * @returns {any} The processed object.
   *
   * @description
   * This function recursively traverses the `source` object, processing its properties and handling arrays, objects, and class instances. It merges overlapping properties from different sources, logging a warning for each conflict.
   *
   * - **Array Handling:** Recursively processes each element of an array.
   * - **Plain Object Handling:** Iterates over the properties of a plain object, recursively processing each value and merging them into the `processed` object. Logs a warning for overlapping properties.
   * - **Class Instance Handling:** Returns the original class instance without modification to avoid unintended side effects.
   *
   * @example
   * const dependencies = {
   *   a: { b: 1, c: [2, { d: 3 }] },
   *   e: new SomeClass(),
   * };
   *
   * const processedDependencies = processDependencies(dependencies);
   */
  const processDependencies = (
    source: any,
    processed: any = {},
    origin: string = ''
  ): any => {
    if (Array.isArray(source)) return source.map(item => processDependencies(item, {}, origin));
    if (source === null || typeof source !== 'object') return source;
    const prototype = Object.getPrototypeOf(source);
    if (prototype !== Object.prototype && prototype !== null) return source;

    for (const [key, value] of Object.entries(source)) {
      if (!Object.hasOwn(processed, key)) {
        Object.defineProperty(processed, key, {
          value: processDependencies(value, {}, origin),
          enumerable: true, writable: true, configurable: true,
        });
      } else {
        console.warn(`Overlapping property '${key}' found in dependencies from module: ${origin}. The existing value will be preserved.`);
      }
    }
    return processed;
  };

  /**
   * Merges and injects dependencies from the main module and all feature modules
   * into the pipeline's dependency object. Handles class instantiation.
   */
  const injectDependencies = (): void => {
    const allDependencies = [...modules].reduce((acc, module) => {
      return processDependencies(module.dependencies, acc, module.slice);
    }, {});

    pipeline.dependencies = allDependencies;
  };

  /**
   * Removes the specified module's dependencies from the pipeline and updates
   * the global dependencies object, ensuring proper handling of nested structures.
   */
  const ejectDependencies = (module: FeatureModule): void => {
    const otherModules = [...modules].filter((m) => m !== module);
    const remainingDependencies = otherModules.reduce((acc, module) => {
      return processDependencies(module.dependencies, acc, module.slice);
    }, {});

    pipeline.dependencies = remainingDependencies;
  };

  /**
   * Populates the store with an array of feature modules.
   * This method ensures modules are initialized and loaded into the store.
   */
  const installModule = async (module: FeatureModule, warnDuplicate = false): Promise<void> => {
    if (modules.some(m => m.slice === module.slice)) {
      if (warnDuplicate) console.warn(`Module ${module.slice} already loaded, skipping`);
      return;
    }

    const previousModules = modules;
    const previousDependencies = pipeline.dependencies;
    const previousHandlers = new Map(registry.actionHandlers);
    const previousThunks = new Map(registry.registeredThunks);
    let batch: MutationBatch | undefined;
    try {
      if (typeof module.configure === 'function') module.configure(store);
      const slicePath = (module.slice || 'main').split('/');
      if (getProperty(state, slicePath) === undefined) {
        batch = new MutationBatch(state);
        await batch.run([], draft => {
          let parent = draft;
          for (const key of slicePath.slice(0, -1)) parent = parent[key] ??= {};
          parent[slicePath[slicePath.length - 1]] = module.initialState;
        });
      }

      modules = [...modules, module];
      registerActionHandlers(module, registry);
      registerThunks(module, registry);
      injectDependencies();
      if (batch) state = batch.commit();
    } catch (error) {
      modules = previousModules;
      pipeline.dependencies = previousDependencies;
      registry.actionHandlers.clear();
      for (const [key, handler] of previousHandlers) registry.actionHandlers.set(key, handler);
      registry.registeredThunks.clear();
      for (const [key, creator] of previousThunks) registry.registeredThunks.set(key, creator);
      try { module.loaded$.fail(error); } catch { /* Preserve the installation failure. */ }
      try { module.destroy?.(false); } catch { /* A failed module must not replace the original error. */ }
      throw error;
    }

    // Observers run after the installation is committed. Their failures cannot
    // roll back state that another observer has already seen.
    if (batch) publish(batch.changes);
    if (settings.dispatchSystemActions) {
      void sysActions.moduleLoaded(module).catch(() => {});
    }
    try { module.loaded$.next(); } catch (error) {
      console.warn(`Error notifying loaded module ${module.slice}:`, error);
    }
  };

  const populate = (...moduleList: FeatureModule[]): Promise<void> =>
    queue.enqueue(async () => {
      for (const module of moduleList) await installModule(module, true);
    });

  const loadModule = (module: FeatureModule): Promise<void> =>
    queue.enqueue(() => installModule(module));

  /**
   * Unloads a feature module from the store, optionally clearing its state.
   * It removes the module, ejects its dependencies, and updates the global state.
   * A `moduleUnloaded` action is dispatched after the module is unloaded.
   */
  const unloadModule = async (
    module: FeatureModule,
    clearState: boolean = false
  ): Promise<void> => {
    return queue.enqueue(async () => {
      // Find the module index in the modules array
      const moduleIndex = modules.findIndex((m) => m.slice === module.slice);

      // Check if the module exists
      if (moduleIndex === -1) {
        console.warn(`Module ${module.slice} not found, cannot unload.`);
        return Promise.resolve(); // Module not found, nothing to unload
      }

      // Remove the module from the internal state
      modules.splice(moduleIndex, 1);

      unregisterActionHandlers(module, registry);
      unregisterThunks(module, registry);

      // Eject dependencies
      ejectDependencies(module);

      const slicePath = normalizePath(module.slice || 'main');
      if (clearState) {
        const batch = new MutationBatch(state);
        await batch.run([], draft => {
          let parent = draft;
          for (const key of slicePath.slice(0, -1)) {
            parent = parent?.[key];
            if (!parent) return;
          }
          if (parent) parent[slicePath[slicePath.length - 1]] = undefined;
        });
        state = batch.commit();
        publish(batch.changes);
      }
      // Dispatch module unloaded action
      if (settings.dispatchSystemActions) {
        void sysActions.moduleUnloaded(module).catch(() => {});
      }
      if (typeof module.destroy === 'function') {
        module.destroy(false);
      } else {
        module.destroyed$.next();
      }
    });
  };

  /**
   * Normalizes a slice path into an array of string segments.
   *
   * This utility function ensures consistent handling of slice paths by converting
   * either a string path (e.g., `"foo/bar/baz"`) or an array of strings (e.g., `["foo", "bar", "baz"]`)
   * into a standardized array format.
   *
   * @param {string | string[]} path - The path to normalize. Can be a slash-delimited string or an array of strings.
   * @returns {string[]} An array of string segments representing the normalized path.
   *
   * @example
   * normalizePath("foo/bar/baz"); // => ["foo", "bar", "baz"]
   * normalizePath(["foo", "bar"]); // => ["foo", "bar"]
   */
  const normalizePath = (path: string | readonly string[]): string[] => {
    return typeof path === 'string' ? path.split('/') : [...path];
  };

  const middlewareAPI = {
    getState: (slice?: string | string[] | '*') =>
      getProperty(
        state,
        slice === undefined ? '*' : slice === '*' ? '*' : normalizePath(slice)
      ),
    dispatch: (action: Action | AsyncAction) => store.dispatch(action as any),
    dependencies: () => pipeline.dependencies,
    strategy: () => pipeline.strategy,
    queue,
    registry,
  } as MiddlewareAPI;

  /**
   * Reads the state slice and executes the provided callback with the current state.
   * The function ensures that state is accessed in a thread-safe manner by using the store queue.
   */
  const getState = <R = any>(
    slice: '*' | string | readonly string[],
    callback: (state: Readonly<R | T>) => void
  ): Promise<void> => {
    return queue.enqueue(async () => {
      const path = slice === '*' ? '*' : normalizePath(slice);
      const stateRead = getProperty(state, path as any) as any;
      await callback(stateRead);
    });
  };

  /**
   * Selects and derives a value from the store's current state using the provided selector.
   *
   * The returned atom emits the selected current value when the first subscriber
   * attaches, then follows state changes. Selector errors and `undefined` results
   * fall back to `defaultValue`.
   *
   * @template R The type of the derived value.
   * @param {(state: T) => R | Promise<R>} selector - A function that selects or derives a value from the current state.
   * @param {R} [defaultValue] - A fallback value to emit when the selected value is `undefined`.
   * @returns {Atom<R>} An atom emitting selected values.
   */
  const select = <R = any>(
    selector: (state: Readonly<T>) => R | Promise<R>,
    defaultValue?: R
  ): Atom<R> => {
    return selectors.track(selector, defaultValue);
  };

  /**
   * Registers a global reducer that runs on every dispatched action.
   */
  const addReducer = (
    reducer: (state: T, action: Action<any> | AsyncAction<T, any>) => T | void | Promise<T | void>
  ): void => {
    void queue.enqueue(async () => {
      if (!settings.enableGlobalReducers) {
        console.warn(
          'Global reducers are disabled; this reducer will not be used unless "enableGlobalReducers" is true.'
        );
        return;
      }
      reducers.push(reducer);
    });
  };

  let store!: Store<T>;
  store = {
    addReducer,
    dispatch,
    getState,
    loadModule,
    populate,
    select,
    unloadModule,
    starter,
    middlewareAPI,
  };

  /**
   * Initializes the store with system actions and state setup
   */
  const initializeStore = (storeInstance: Store<any>) => {
    // System actions are used immediately, before queued module registration runs.
    systemModule.configure(storeInstance);
    // Bind system actions using the store's dispatch method
    registerModule(storeInstance, systemModule);

    sysActions = systemModule.actions;

    // Initialize state and mark store as initialized
    if (settings.dispatchSystemActions) {
      void sysActions.initializeState().catch(() => {});
    }

    console.log(
      '%cYou are using Actionstack. Happy coding! 🎉',
      'font-weight: bold;'
    );

    // The observable system marker honors the setting; internal bookkeeping always runs.
    if (settings.dispatchSystemActions) {
      void sysActions.storeInitialized().catch(() => {});
    }
  };

  // Always run the starter middleware as the outermost middleware layer,
  // so it executes before any user-applied middlewares.
  const applyStarterMiddleware: StoreEnhancer = (next) => (settings, enhancer) => {
    const store = next(settings, enhancer);
    const starterDispatch = store.starter(store.middlewareAPI)(store.dispatch);
    return { ...store, dispatch: starterDispatch };
  };

  enhancer = combineEnhancers(enhancer, applyStarterMiddleware);

  store = enhancer(() => store)(settings);
  let originalDispatch = store.dispatch;
  store.dispatch = (action: Action | AsyncAction<T, any>): Promise<any> => {
    // Fast path: avoid creating closures/promises if no tracking is needed
    if (!settings.awaitStatePropagation) {
      return originalDispatch(action);
    }

    let result: any;

    // Preserve dispatch return value
    result = originalDispatch(action);

    // Support async dispatch (thunks, effects, etc.)
    return Promise.resolve(result).then(async () => {
      await propagation;
      await selectors.settled();
      await waitForBrowserIdle();
      return result;
    });
  };
  
  initializeStore(store);
  return store;
}
