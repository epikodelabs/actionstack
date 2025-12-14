import { action, getActionHandlers, registerActionHandlers, registerThunks, unregisterActionHandlers, unregisterThunks } from './actions';
import {
  applyMiddleware,
  combineEnhancers,
  getProperty,
  setProperty,
} from './utils';
import { createLock } from './lock';
import { starter } from './starter';
import { createTracker, Tracker } from './tracker';
import {
  Action,
  AsyncAction,
  FeatureModule,
  Middleware,
  MiddlewareAPI,
  StoreEnhancer,
} from './types';
import {
  createBehaviorSubject,
  createSubject,
  distinctUntilChanged,
  map,
  Stream,
  Subscription,
} from '@actioncrew/streamix';
import { createModule, registerModule } from './module';
import { AsyncReducer, Reducer } from './types';
import { trackable } from './trackable';
import { createQueue } from './queue';

/**
 * Class representing configuration options for a store.
 * This class defines properties that control various behaviors of a store for managing application state.
 */
export type StoreSettings = {
  dispatchSystemActions?: boolean;
  awaitStatePropagation?: boolean;
  enableGlobalReducers?: boolean;
  exclusiveActionProcessing?: boolean;
};

/**
 * The default settings for the store that configure various behaviors such as action dispatch,
 * state propagation, and reducer handling.
 */
const defaultStoreSettings: StoreSettings = {
  dispatchSystemActions: true,
  awaitStatePropagation: false,
  enableGlobalReducers: true,
  exclusiveActionProcessing: false,
};

/**
 * The `Store` type represents the core store object that manages state, actions, and modules.
 * It provides methods to interact with the store's state, dispatch actions, load/unload modules, and more.
 */
export type Store<T = any> = {
  dispatch: (action: Action | any) => Promise<void>;
  getState: (
    slice: keyof T | string[] | '*',
    callback: (state: Readonly<T>) => void | Promise<void>
  ) => Promise<void>;
  select<R = any>(
    selector: (state: T) => R | Promise<R>,
    defaultValue?: R
  ): Stream<R>;
  populate: (...modules: FeatureModule[]) => Promise<void>;
  loadModule: (module: FeatureModule) => Promise<void>;
  unloadModule: (module: FeatureModule, clearState?: boolean) => Promise<void>;
  addReducer: (reducer: (state: T, action: Action) => T | Promise<T>) => void;
  getMiddlewareAPI: () => MiddlewareAPI;
  starter: Middleware;
  tracker: Tracker;
};

interface SystemState {
  _initialized: boolean;
  _ready: boolean;
  _modules: string[];
}

const systemModule = createModule({
  slice: 'system',
  initialState: {
    _initialized: false,
    _ready: false,
    _modules: [],
  } as SystemState,
  actions: {
    initializeState: action('INITIALIZE_STATE', (state: SystemState) => ({
      _modules: [],
      _initialized: false,
      _ready: false,
    })),

    updateState: action(
      'UPDATE_STATE',
      (state: SystemState, payload: Partial<SystemState>) => ({
        ...state,
        ...payload,
      })
    ),

    storeInitialized: action('STORE_INITIALIZED', (state: SystemState) => ({
      ...state,
      _initialized: true,
      _ready: true,
    })),

    moduleLoaded: action(
      'MODULE_LOADED',
      (state: SystemState, payload: { slice: string }) => ({
        ...state,
        _modules: [...state._modules, payload.slice],
      })
    ),

    moduleUnloaded: action(
      'MODULE_UNLOADED',
      (state: SystemState, payload: { slice: string }) => ({
        ...state,
        _modules: state._modules.filter((m) => m !== payload.slice),
      })
    ),
  },
  selectors: {
    isInitialized: () => (state: SystemState) => state._initialized,
    isReady: () => (state: SystemState) => state._ready,
    loadedModules: () => (state: SystemState) => state._modules,
  },
  dependencies: {},
});

export function isSystemActionType(type: string): boolean {
  const actions = Object.values(systemModule.actions) as Array<{
    type: string;
  }>;
  return actions.some((a) => a.type === type);
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
  let modules: FeatureModule[] = [];
  let sysActions = systemModule.actions;
  let reducers: (Reducer | AsyncReducer)[] = [];

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
  let currentState = createBehaviorSubject<T>(state as T);
  const tracker = settings.awaitStatePropagation ? createTracker() : undefined;
  const lock = createLock();
  const queue = createQueue();

  /**
   * Dispatches an action to update the global state.
   *
   * The function validates the action to ensure it is a plain object with a defined and string type property.
   * If any validation fails, a warning is logged to the console and the action is not dispatched.
   * After validation, the action is processed by the reducer, and the global state is updated accordingly.
   */
  let dispatch = async (action: Action | any): Promise<void> => {
    let newState = state; // start with current state

    const handler = getActionHandlers(action.type);

    if (handler) {
      const slicePath = action.type.split('/').slice(0, -1); // handles 'foo/bar/ACTION'
      const currentSliceState = getProperty(newState, slicePath);
      const updatedSliceState = await handler(
        currentSliceState,
        action.payload
      );
      newState = setProperty(newState, slicePath, updatedSliceState);
    }

    if (reducers?.length) {
      for (let i = reducers.length - 1; i >= 0; i--) {
        try {
          const reducer = reducers[i];
          const maybeUpdatedState = await reducer(newState, action);
          if (maybeUpdatedState !== undefined) {
            newState = maybeUpdatedState;
          }
        } catch (err: any) {
          console.warn(`Error in meta-reducer ${i}:`, err.message ?? err);
        }
      }
    }

    // Emit only once after all reducers have run
    if (newState !== state) {
      state = newState;
      currentState.next(state as T);
    }

    // Wait for state propagation if required
    if (settings.awaitStatePropagation) {
      await tracker?.allExecuted();
      tracker?.reset();
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
    if (Array.isArray(source)) {
      return source.map((item) => processDependencies(item, processed));
    }

    if (source && typeof source === 'object') {
      // Check if the source is a plain object
      if (
        typeof source.constructor === 'function' &&
        source.constructor !== Object
      ) {
        return source;
      } else {
        for (const [key, value] of Object.entries(source)) {
          if (!processed.hasOwnProperty(key)) {
            processed[key] = processDependencies(value, processed, origin);
          } else {
            console.warn(
              `Overlapping property '${key}' found in dependencies from module: ${origin}. The existing value will be preserved.`
            );
          }
        }
        return processed; // Assume it's a class instance or other non-plain object
      }
    }

    return source;
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
  const populate = async (...moduleList: FeatureModule[]): Promise<void> => {
    try {
      await lock.acquire();

      // Load modules sequentially within the same queue operation
      for (const module of moduleList) {
        if (modules.some((m) => m.slice === module.slice)) {
          console.warn(`Module ${module.slice} already loaded, skipping`);
          continue;
        }

        try {
          // Register the module first
          modules = [...modules, module];

          // Register action handlers
          registerActionHandlers(module);
          registerThunks(module);

          // Inject dependencies
          injectDependencies();

          // Initialize state if not already present
          const slicePath = (module.slice || 'main').split('/');
          if (getProperty(state, slicePath) === undefined) {
            state = setProperty(state, slicePath, module.initialState);
          }
          
          // Dispatch system action
          sysActions.moduleLoaded(module);
          // Signal that module is loaded (this should be the last step)
          module.loaded$.next();
          // Update current state
          currentState.next(state);
        } catch (error) {
          console.warn(`Failed to load module ${module.slice}:`, error);

          // Clean up on failure
          const moduleIndex = modules.findIndex(
            (m) => m.slice === module.slice
          );
          if (moduleIndex !== -1) {
            modules.splice(moduleIndex, 1);
          }

          // Signal error on loaded$ subject
          module.loaded$.error(error);

          throw error; // Re-throw to let caller handle
        }
      }
    } finally {
      lock.release(); // Release lock regardless of success or failure
    }
  };

  /**
   * Loads a new feature module into the store if it isn't already loaded.
   * It ensures that dependencies are injected, the global state is updated,
   * and a `moduleLoaded` action is dispatched once the module is successfully loaded.
   */
  const loadModule = async (module: FeatureModule): Promise<void> => {
    if (modules.some((m) => m.slice === module.slice)) {
      return Promise.resolve(); // Already loaded
    }

    module.configure(store);

    try {
      await lock.acquire();
      // Register the module
      modules = [...modules, module];

      registerActionHandlers(module);
      registerThunks(module);

      // Inject dependencies
      injectDependencies();

      const slicePath = (module.slice || 'main').split('/');
      if (getProperty(state, slicePath) === undefined) {
        state = setProperty(state, slicePath, module.initialState);
      }

      sysActions.moduleLoaded(module);
      module.loaded$.next();
      currentState.next(state);

    } finally {
      lock.release(); // Release lock regardless of success or failure
    }
  };

  /**
   * Unloads a feature module from the store, optionally clearing its state.
   * It removes the module, ejects its dependencies, and updates the global state.
   * A `moduleUnloaded` action is dispatched after the module is unloaded.
   */
  const unloadModule = async (
    module: FeatureModule,
    clearState: boolean = false
  ): Promise<void> => {
    try {
      await lock.acquire();

      // Find the module index in the modules array
      const moduleIndex = modules.findIndex((m) => m.slice === module.slice);

      // Check if the module exists
      if (moduleIndex === -1) {
        console.warn(`Module ${module.slice} not found, cannot unload.`);
        return Promise.resolve(); // Module not found, nothing to unload
      }

      // Remove the module from the internal state
      modules.splice(moduleIndex, 1);

      unregisterActionHandlers(module);
      unregisterThunks(module);

      // Eject dependencies
      ejectDependencies(module);

      const slicePath = normalizePath(module.slice || 'main');
      if (clearState) {
        state = setProperty(state, slicePath, undefined);
      }
      // Dispatch module unloaded action
      sysActions.moduleUnloaded(module);
      module.destroyed$.next();
      currentState.next(state);

    } finally {
      lock.release(); // Release lock regardless of success or failure
    }
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
  const normalizePath = (path: string | string[]): string[] => {
    return Array.isArray(path) ? path : path.split('/');
  };

  /**
   * Reads the state slice and executes the provided callback with the current state.
   * The function ensures that state is accessed in a thread-safe manner by acquiring a lock.
   */
  const getState = (
    slice: string | string[],
    callback: (state: Readonly<T | undefined>) => void | Promise<void>
  ): Promise<void> => {
    const promise = (async () => {
      try {
        await lock.acquire(); //Potentially we can check here for an idle of the pipeline
        const stateRead = (await getProperty(
          state,
          normalizePath(slice)
        )) as any; // Get state after acquiring lock
        callback(stateRead);
      } finally {
        lock.release(); // Release lock regardless of success or failure
      }
    })();

    return promise;
  };

  /**
   * Selects and derives a value from the store's current state using the provided selector.
   * The returned stream is automatically tracked for iteration completion.
   *
   * @template R The type of the derived value.
   * @param {(state: T) => R | Promise<R>} selector - A function that selects or derives a value from the current state.
   * @param {R} [defaultValue] - A fallback value to emit when the selected value is `undefined`.
   * @returns {Stream<R>} A trackable stream emitting selected values.
   */
  const select = <R>(
    selector: (state: T) => R,
    defaultValue?: R
  ): Stream<R> => {
    const source$ = currentState.pipe(
      map((state: T) => {
        if (state == null) {
          return defaultValue as R;
        }

        const value = selector(state);
        return value === undefined ? (defaultValue as R) : value;
      }),
      distinctUntilChanged()
    );

    return tracker ? trackable(source$, tracker) : source$;
  };

  /**
   * Registers a global reducer that runs on every dispatched action.
   */
  const addReducer = (
    reducer: (state: T, action: Action) => T | Promise<T>
  ) => {
    return queue.enqueue(async () => {
      if (!settings.enableGlobalReducers) {
        console.warn(
          'Global reducers are disabled; this reducer will not be used unless "enableGlobalReducers" is true.'
        );
        return;
      }
      reducers.push(reducer);
    });
  };

  /**
   * Creates the middleware API object for use in the middleware pipeline.
   */
  const getMiddlewareAPI = () => ({
    getState: (slice?: string | string[]) =>
      getProperty(state, slice ? normalizePath(slice) : '*'),
    dispatch: (action: Action | AsyncAction) => dispatch(action),
    dependencies: () => pipeline.dependencies,
    strategy: () => pipeline.strategy,
    lock: lock
  }) as MiddlewareAPI;

  let store = {
    starter,
    tracker,
    dispatch,
    getState,
    select,
    populate,
    loadModule,
    unloadModule,
    getMiddlewareAPI,
    addReducer,
  } as Store<any>;

  /**
   * Initializes the store with system actions and state setup
   */
  const initializeStore = (storeInstance: Store<any>) => {
    // Bind system actions using the store's dispatch method
    registerModule(storeInstance, systemModule);

    sysActions = systemModule.actions;

    // Initialize state and mark store as initialized
    sysActions.initializeState();

    console.log(
      '%cYou are using ActionStack. Happy coding! 🎉',
      'font-weight: bold;'
    );

    sysActions.storeInitialized();
  };

  // Apply enhancer if provided
  if (typeof enhancer === 'function') {
    // Check if the enhancer contains applyMiddleware
    const hasMiddlewareEnhancer =
      enhancer.name === 'applyMiddleware' ||
      (enhancer as any).names?.includes('applyMiddleware');

    // If no middleware enhancer is present, apply applyMiddleware explicitly with an empty array
    if (!hasMiddlewareEnhancer) {
      enhancer = combineEnhancers(enhancer, applyMiddleware());
    }
  } else {
    enhancer = combineEnhancers(applyMiddleware());
  }

  store = enhancer(() => store)(settings);
  let originalDispatch = store.dispatch;
  store.dispatch = (action) => queue.enqueue(() => originalDispatch(action));
  initializeStore(store);
  return store;
}
