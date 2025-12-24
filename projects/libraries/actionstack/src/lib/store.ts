import type { Stream } from '@epikodelabs/streamix';
import { createBehaviorSubject, distinctUntilChanged, map } from '@epikodelabs/streamix';
import { action, getActionHandlers, registerActionHandlers, registerThunks, unregisterActionHandlers, unregisterThunks } from './actions';
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
  Tracker,
} from './types';
import {
  combineEnhancers,
  getProperty,
  setProperty,
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
        <R = any>(selector: (state: Readonly<TState>) => R, defaultValue?: R): Stream<R>;
        <R = any>(selector: (state: Readonly<TState>) => Promise<R>, defaultValue?: R): Stream<R>;
    };

    populate: (...modules: FeatureModule[]) => Promise<void>;
    loadModule: (module: FeatureModule) => Promise<void>;
    unloadModule: (module: FeatureModule, clearState?: boolean) => Promise<void>;

    addReducer: (reducer: (state: TState, action: Action<any> | AsyncAction<TState, TDependencies>) => TState | Promise<TState>) => void;

    middlewareAPI: MiddlewareAPI;
    starter: Middleware;
    tracker?: Tracker;
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
      isInitialized: () => (state: SystemState) => state._initialized,
      isReady: () => (state: SystemState) => state._ready,
      loadedModules: () => (state: SystemState) => state._modules,
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
  const queue = createQueue();

  /**
   * Dispatches an action to update the global state.
   *
   * The function validates the action to ensure it is a plain object with a defined and string type property.
   * If any validation fails, a warning is logged to the console and the action is not dispatched.
   * After validation, the action is processed by the reducer, and the global state is updated accordingly.
   */
  let dispatch: Dispatch<T, any> = async (action) => {
    if (typeof action === 'function') {
      await (action as AsyncAction<T, any>)(dispatch, () => state, pipeline.dependencies);
      return;
    }

    if (!action || typeof action !== 'object' || typeof (action as any).type !== 'string') {
      console.warn('Invalid action dispatched:', action);
      return;
    }

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
    return queue.enqueue(async () => {
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
    });
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

    return queue.enqueue(async () => {
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
    });
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
      const stateRead = (await getProperty(state, path as any)) as any;
      await callback(stateRead);
    });
  };

  /**
   * Selects and derives a value from the store's current state using the provided selector.
   *
   * @template R The type of the derived value.
   * @param {(state: T) => R | Promise<R>} selector - A function that selects or derives a value from the current state.
   * @param {R} [defaultValue] - A fallback value to emit when the selected value is `undefined`.
   * @returns {Stream<R>} A stream emitting selected values.
   */
  const select = <R = any>(
    selector: (state: Readonly<T>) => R | Promise<R>,
    defaultValue?: R
  ): Stream<R> => {
    const source$ = currentState.pipe(
      map(async (state: T) => {
        if (state == null) return defaultValue as R;
        try {
          const value = await selector(state);
          return value === undefined ? (defaultValue as R) : value;
        } catch (err: any) {
          console.warn(`Error in selector: ${err?.message ?? err}`);
          return defaultValue as R;
        }
      }),
      distinctUntilChanged()
    );

    const tracker = store.tracker;
    if (!tracker) return source$;

    return {
      ...source$,
      subscribe(observer: any) {
        let subscription: any;
        const wrappedObserver = {
          next: (value: R) => {
            observer?.next?.(value);
            if (subscription) tracker.signal(subscription);
          },
          error: (err: any) => {
            observer?.error?.(err);
            if (subscription) tracker.complete(subscription);
          },
          complete: () => {
            observer?.complete?.();
            if (subscription) tracker.complete(subscription);
          },
        };

        subscription = source$.subscribe(wrappedObserver);
        tracker.track(subscription);

        const originalUnsubscribe = subscription?.unsubscribe?.bind(subscription);
        if (typeof originalUnsubscribe === 'function') {
          subscription.unsubscribe = () => {
            tracker.complete(subscription);
            return originalUnsubscribe();
          };
        }

        return subscription;
      },
    };
  };

  /**
   * Registers a global reducer that runs on every dispatched action.
   */
  const addReducer = (
    reducer: (state: T, action: Action<any> | AsyncAction<T, any>) => T | Promise<T>
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
  store.dispatch = (action) => {
    // Fast path: avoid creating closures/promises if no tracking is needed
    if (!settings.awaitStatePropagation || !store.tracker) {
      return originalDispatch(action);
    }

    let result: any;

    store.tracker!.reset();

    // Preserve dispatch return value
    result = originalDispatch(action);

    // Support async dispatch (thunks, effects, etc.)
    return Promise.resolve(result).then(async () => {
      await store.tracker!.waitAll();
      return result;
    });
  };
  
  initializeStore(store);
  return store;
}

