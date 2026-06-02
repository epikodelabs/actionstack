import { createReplaySubject, createSubject, switchMap, takeUntil, map, mergeMap, createBehaviorSubject, createReceiver, createSubscription, createAsyncIterator, firstValueFrom, pipeSourceThrough } from '@epikodelabs/streamix';

/**
 * Determines the type of a given value.
 *
 * This function attempts to identify the underlying type of a JavaScript value
 * using a combination of checks and built-in functions.
 *
 * @param val - The value to determine the type for.
 * @returns string - A string representing the type of the value (e.g., "undefined", "string", "array", etc.).
 */
function kindOf(val) {
    if (val === undefined)
        return "undefined";
    if (val === null)
        return "null";
    const type = typeof val;
    switch (type) {
        case "boolean":
        case "string":
        case "number":
        case "symbol":
        case "function": {
            return type;
        }
    }
    if (Array.isArray(val))
        return "array";
    if (isDate(val))
        return "date";
    if (isError(val))
        return "error";
    if (isStream(val))
        return "Stream";
    if (isPromise(val))
        return "promise";
    const constructorName = ctorName(val);
    switch (constructorName) {
        case "Symbol":
        case "WeakMap":
        case "WeakSet":
        case "Map":
        case "Set":
            return constructorName;
    }
    return Object.prototype.toString.call(val).slice(8, -1).toLowerCase().replace(/\s/g, "");
}
/**
 * Attempts to get the constructor name of a value.
 *
 * This function checks if the value has a constructor that is a function,
 * and if so, it returns the name of the constructor. Otherwise, it returns null.
 *
 * @param val - The value to get the constructor name for.
 * @returns string - The name of the constructor (if applicable), otherwise null.
 */
function ctorName(val) {
    return typeof val.constructor === "function" ? val.constructor.name : null;
}
/**
 * Checks if a value is an Error object.
 *
 * This function uses two criteria to determine if a value is an Error:
 *   - It checks if the value is an instance of the built-in `Error` class.
 *   - It checks if the value has a string property named "message" and a constructor with a number property named "stackTraceLimit".
 *
 * @param val - The value to check if it's an Error.
 * @returns boolean - True if the value is an Error, false otherwise.
 */
function isError(val) {
    return val instanceof Error || typeof val.message === "string" && val.constructor && typeof val.constructor.stackTraceLimit === "number";
}
/**
 * Checks if a value is a Date object.
 *
 * This function uses two approaches to determine if a value is a Date:
 *   - It checks if the value is an instance of the built-in `Date` class.
 *   - It checks if the value has functions named `toDateString`, `getDate`, and `setDate`.
 *
 * @param val - The value to check if it's a Date.
 * @returns boolean - True if the value is a Date, false otherwise.
 */
function isDate(val) {
    if (val instanceof Date)
        return true;
    return typeof val.toDateString === "function" && typeof val.getDate === "function" && typeof val.setDate === "function";
}
/**
 * Checks if a value is a boxed primitive.
 *
 * This function checks if a value is not `undefined` or `null`, and its value doesn't strictly equal itself when called with `valueOf()`.
 * Primitive values wrapped in their corresponding object representations (e.g., new Number(10)) are considered boxed.
 *
 * @param value - The value to check if it's boxed.
 * @returns boolean - True if the value is a boxed primitive, false otherwise.
 */
function isBoxed(value) {
    return value !== undefined && value !== null && value.valueOf() !== value;
}
/**
 * Checks if a value is a Promise object.
 *
 * This function uses a trick to identify promises. It resolves the value with `Promise.resolve` and compares the resolved value with the original value.
 * If they are the same, it's likely a promise.
 *
 * @param value - The value to check if it's a Promise.
 * @returns boolean - True if the value is a Promise, false otherwise.
 */
function isPromise(value) {
    return Promise.resolve(value) == value;
}
/**
 * Checks if a value is a valid ActionStack action object.
 *
 * This function determines if the provided value is a valid action object
 * used in ActionStack for dispatching state changes.
 *
 * @param action - The value to check if it's a ActionStack action.
 * @returns boolean - True if the value is a plain object with a string property named "type", false otherwise.
 */
function isAction(action) {
    return isPlainObject(action) && "type" in action && typeof action.type === "string";
}
/**
 * Checks if a function is an async function.
 *
 * This function uses the constructor name to determine if the provided function
 * is an async function introduced in ES2018.
 *
 * @param func - The function to check if it's an async function.
 * @returns boolean - True if the function's constructor name is "AsyncFunction", false otherwise.
 */
function isAsync(func) {
    return func.constructor.name === "AsyncFunction";
}
/**
 * Checks if a value is a plain object.
 *
 * This function determines if the provided value is a plain object (an object
 * that doesn't inherit from other prototypes).
 *
 * @param obj - The value to check if it's a plain object.
 * @returns boolean - True if the value is an object and its prototype is the same as the Object.prototype, false otherwise.
 */
function isPlainObject(obj) {
    if (typeof obj !== "object" || obj === null)
        return false;
    let proto = obj;
    while (Object.getPrototypeOf(proto) !== null) {
        proto = Object.getPrototypeOf(proto);
    }
    return Object.getPrototypeOf(obj) === proto;
}
/**
 * Tests to see if the object is a streamix Stream
 * @param obj the object to test
 */
function isStream(obj) {
    // The !! is to ensure that this publicly exposed function returns
    // `false` if something like `null` or `0` is passed.
    return !!obj && obj.type === 'stream' && typeof obj.subscribe === 'function';
}

/**
 * Creates a fresh, isolated action registry for a store instance.
 * Keeping registries per-store prevents collisions when multiple stores exist.
 */
function createActionRegistry() {
    return {
        actionHandlers: new Map(),
        registeredThunks: new Map(),
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
const getRegisteredThunks = (registry) => Array.from(registry.registeredThunks.values());
/**
 * Retrieves the registered handler function for a specific action type.
 *
 * @param {string} type - The action type to look up.
 * @param {ActionRegistry} registry - The store's action registry.
 * @returns {Function | undefined} The handler function associated with the action type, or `undefined` if none is registered.
 */
const getActionHandlers = (type, registry) => registry.actionHandlers.get(type);
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
const registerActionHandlers = (module, registry) => {
    Object.values(module.actions).forEach((action) => {
        if (action.type && registry.actionHandlers.has(action.type)) {
            console.warn(`Action handler for "${action.type}" already registered - preserving existing handler`);
        }
        else if (action.type) {
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
const unregisterActionHandlers = (module, registry) => {
    Object.values(module.actions).forEach((action) => {
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
const registerThunks = (module, registry) => {
    const sourceActions = module.__rawActions ?? module.actions;
    Object.values(sourceActions || {}).forEach((thunk) => {
        if (thunk.isThunk && thunk.type) {
            if (registry.registeredThunks.has(thunk.type)) {
                console.warn(`Thunk "${thunk.type}" already registered - preserving existing thunk`);
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
const unregisterThunks = (module, registry) => {
    const sourceActions = module.__rawActions ?? module.actions;
    Object.values(sourceActions || {}).forEach((thunk) => {
        if (thunk.isThunk && thunk.type && registry.registeredThunks.has(thunk.type)) {
            registry.registeredThunks.delete(thunk.type);
        }
    });
};
/**
 * Implementation of createAction.
 * @internal
 */
function createAction(type, handler = (() => void 0), payloadCreator) {
    const defaultPayloadCreator = ((...args) => (args.length > 0 ? args[0] : undefined));
    const actualPayloadCreator = payloadCreator ?? defaultPayloadCreator;
    const creator = (...args) => {
        const payload = actualPayloadCreator(...args);
        const action = { type };
        if (payload !== undefined) {
            action.payload = payload;
            if (payload !== null && typeof payload === 'object') {
                if ('meta' in payload)
                    action.meta = payload.meta;
                if ('error' in payload)
                    action.error = payload.error;
            }
        }
        return action;
    };
    return Object.assign(creator, {
        handler,
        type,
        toString: () => type,
        match: (action) => action?.type === type,
    });
}
function createThunk(type, thunkBodyCreator, triggers) {
    const match = (action) => isAction(action) && action.type === type;
    const thunkCreator = ((...args) => {
        const thunk = thunkBodyCreator(...args);
        const wrappedThunk = async (dispatch, getState, dependencies) => {
            try {
                await thunk(dispatch, getState, dependencies);
            }
            catch (error) {
                const message = error?.message ?? String(error);
                console.warn(`Error in thunk action "${type}": ${message}.`);
                throw error;
            }
        };
        const thunkWithProps = Object.assign(wrappedThunk, {
            type,
            toString: () => type,
            match,
            isThunk: true,
            ...(triggers?.length ? { triggers } : {}),
        });
        return thunkWithProps;
    });
    return Object.assign(thunkCreator, {
        type,
        toString: () => type,
        match,
        isThunk: true,
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
function bindActionCreator(actionCreator, dispatch) {
    return function (...args) {
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
function bindActionCreators(actionCreators, dispatch) {
    if (typeof actionCreators === 'function') {
        return bindActionCreator(actionCreators, dispatch);
    }
    if (typeof actionCreators !== 'object' || actionCreators === null) {
        console.warn(`bindActionCreators expected an object or a function, but received: '${Object.prototype.toString.call(actionCreators)}'.`);
        return undefined;
    }
    const boundActionCreators = {};
    for (const key in actionCreators) {
        const actionCreator = actionCreators[key];
        if (typeof actionCreator === 'function') {
            boundActionCreators[key] = bindActionCreator(actionCreator, dispatch);
        }
    }
    return boundActionCreators;
}

/**
 * Generates a random string of a specified length in base-36 (including digits and lowercase letters).
 *
 * @param {number} length  - The desired length of the random string.
 * @returns {string}       - A random base-36 string of the provided length.
 */
function salt(length) {
    return Math.random().toString(36).substring(2).padStart(length, "0").slice(0, length);
}
/**
 * Creates a simple 3-character hash of a string using a basic multiplication-based algorithm.
 *
 * @param {string} str - The string to be hashed.
 * @returns {string}   - A 3-character base-36 string representing the hash of the input string.
 */
function hash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = 31 * h + str.charCodeAt(i);
    }
    // Convert to base-36 string and pad with zeros
    let hash = h.toString(36).padStart(3, "0");
    // Return the first 3 characters of the hash
    return hash.slice(0, 3);
}
/**
 * Generates a self-checking token by combining a random salt and a 3-character hash of the salt, separated by dots.
 *
 * @returns {string} - A string containing the salt and its hash separated by dots (e.g., "abc.def").
 */
function generateToken() {
    let payload = salt(7), hashstr = hash(payload);
    return payload.concat(hashstr).split('').join('.');
}
/**
 * Validates a provided token string based on its format and internal hash check.
 *
 * @param {string} token  - The token string to be validated.
 * @returns {boolean}     - True if the token is a valid format and the internal hash check passes, false otherwise.
 */
function isValidToken(token) {
    return typeof token === 'string' && (token = token.replace(/\./g, '')).length === 10 && hash(token.slice(0, 7)) === token.slice(7, 10);
}

/**
 * Waits until the browser reaches an idle slot.
 *
 * This is a scheduler-level quiescence helper used by ActionStack's
 * `awaitStatePropagation` option when callers prefer to defer resolution until
 * the environment had a chance to flush visual/update work.
 *
 * Resolution order:
 * - `requestIdleCallback` when available
 * - `requestAnimationFrame` as a frame-level fallback
 * - `setTimeout(..., 0)` as the final universal fallback
 */
function waitForBrowserIdle(timeout = 50) {
    return new Promise((resolve) => {
        const scope = globalThis;
        if (typeof scope.requestIdleCallback === "function") {
            scope.requestIdleCallback(() => resolve(), { timeout });
            return;
        }
        if (typeof scope.requestAnimationFrame === "function") {
            scope.requestAnimationFrame(() => resolve());
            return;
        }
        setTimeout(resolve, 0);
    });
}

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
function createModule(config) {
    const { slice } = config;
    const pathParts = slice.split('/');
    // Helper to select nested slice
    function selectSlice(rootState) {
        return pathParts.reduce((s, key) => (s ? s[key] : undefined), rootState);
    }
    let configured = false;
    let loaded$ = createReplaySubject();
    let destroyed$ = createSubject();
    const processedActions = processActions(config.actions ?? {}, slice, config.dependencies);
    let processedSelectors = {};
    let store;
    const module = {
        slice,
        initialState: config.initialState,
        dependencies: config.dependencies,
        __rawActions: processedActions,
        loaded$,
        destroyed$,
        data$: {},
        actions: {},
        selectors: {},
        init(storeInstance) {
            return this.configure(storeInstance);
        },
        configure(storeInstance) {
            if (configured)
                return this;
            configured = true;
            store = storeInstance;
            // Recreate subjects to support module reuse after destroy
            loaded$ = createReplaySubject();
            destroyed$ = createSubject();
            this.loaded$ = loaded$;
            this.destroyed$ = destroyed$;
            processedSelectors = processSelectors(config.selectors ?? {}, selectSlice);
            // Update the module's selectors
            this.selectors = processedSelectors;
            // Initialize data$ streams and actions with the store
            initializeDataStreams(this, processedSelectors, loaded$, destroyed$, () => store);
            initializeActions(this, processedActions, slice, () => store);
            // Mark module as loaded
            loaded$.next();
            return this;
        },
        destroy(clearState) {
            destroyed$.next();
            destroyed$.complete();
            loaded$.complete();
            if (store && clearState !== false) {
                store.unloadModule(this, true);
            }
            configured = false;
            store = undefined;
            return this;
        }
    };
    return module;
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
function processActions(actions, slice, dependencies = {}) {
    const processed = {};
    for (const [name, action] of Object.entries(actions)) {
        if (isActionCreator(action)) {
            const namespacedType = `${slice}/${action.type}`;
            const namespacedAction = (...args) => {
                const act = action(...args);
                return {
                    ...act,
                    type: namespacedType,
                };
            };
            Object.assign(namespacedAction, action, {
                type: namespacedType,
                toString: () => namespacedType,
                match: (act) => isAction(act) && act.type === namespacedType
            });
            processed[name] = namespacedAction;
        }
        else {
            const originalType = typeof action?.type === 'string' ? action.type : name;
            const namespacedType = originalType.includes('/')
                ? originalType
                : `${slice}/${originalType}`;
            const thunkWithType = (...args) => {
                const thunk = action(...args);
                return Object.assign(async (dispatch, getState, deps) => {
                    return thunk(dispatch, getState, {
                        ...deps,
                        ...dependencies,
                    });
                }, {
                    type: namespacedType,
                    isThunk: true,
                    toString: () => namespacedType,
                    match: (act) => isAction(act) && act.type === namespacedType
                });
            };
            Object.assign(thunkWithType, {
                type: namespacedType,
                isThunk: true,
                toString: () => namespacedType,
                match: (act) => isAction(act) && act.type === namespacedType,
                triggers: action.triggers?.map((t) => typeof t === 'string' ? (t.includes('/') ? t : `${slice}/${t}`) : t)
            });
            processed[name] = thunkWithType;
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
function processSelectors(selectors, selectSlice) {
    const processed = {};
    for (const [name, sliceSelector] of Object.entries(selectors)) {
        if (typeof sliceSelector !== 'function') {
            throw new Error(`Selector "${name}" must be a function.`);
        }
        if (sliceSelector.length === 0) {
            throw new Error(`Selector "${name}" must accept slice state directly. Selector factories are not supported.`);
        }
        const rootSelector = (rootState) => sliceSelector(selectSlice(rootState));
        processed[name] = rootSelector;
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
 * @param {Selectors} processedSelectors Processed selectors.
 * @param {import('@epikodelabs/streamix').ReplaySubject<void>} loaded$ Emits when the module is fully loaded.
 * @param {import('@epikodelabs/streamix').Subject<void>} destroyed$ Emits when the module is destroyed.
 * @param {() => Store<State> | undefined} getStore Function that returns the store instance.
 */
function initializeDataStreams(moduleInstance, processedSelectors, loaded$, destroyed$, getStore) {
    for (const key in processedSelectors) {
        const selectorFn = processedSelectors[key];
        // ✅ data$.key() — zero args
        moduleInstance.data$[key] = () => {
            return loaded$.pipe(switchMap(() => {
                const store = getStore();
                if (!store) {
                    throw new Error(`Module "${moduleInstance.slice}" store not available for data$ streams`);
                }
                // ✅ selectorFn is already (rootState) => value
                return store.select(selectorFn);
            }), takeUntil(destroyed$));
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
function initializeActions(moduleInstance, processedActions, slice, getStore) {
    for (const key in processedActions) {
        const actionCreator = processedActions[key];
        moduleInstance.actions[key] = (...args) => {
            // Access store via getter at runtime
            const store = getStore();
            if (!store) {
                throw new Error(`Module "${slice}" actions cannot be dispatched before configuration. ` +
                    `Call module.configure(store) first.`);
            }
            const actionToDispatch = actionCreator(...args);
            store.dispatch(actionToDispatch);
            return actionToDispatch;
        };
        // Preserve metadata from original function (e.g. type)
        Object.defineProperties(moduleInstance.actions[key], Object.getOwnPropertyDescriptors(actionCreator));
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
function isActionCreator(obj) {
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
function registerModule(store, ...modules) {
    if (modules.length === 0)
        return modules;
    if (modules.length === 1) {
        store.loadModule(modules[0]);
    }
    else {
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
function unregisterModule(store, ...modulesOrClearState) {
    if (modulesOrClearState.length === 0)
        return [];
    let clearState = true;
    if (typeof modulesOrClearState[0] === 'boolean') {
        clearState = modulesOrClearState.shift();
    }
    if (modulesOrClearState.length && typeof modulesOrClearState[modulesOrClearState.length - 1] === 'boolean') {
        clearState = modulesOrClearState.pop();
    }
    const modules = modulesOrClearState;
    modules.forEach((module) => {
        store.unloadModule(module, clearState);
    });
    return modules;
}
function populateStore(store, ...modules) {
    store.populate(...modules);
    return modules;
}

/**
 * Creates an asynchronous queue that processes operations sequentially.
 * Operations are guaranteed to run in the order they are enqueued, one after another.
 * This is useful for preventing race conditions and ensuring that dependent
 * asynchronous tasks are executed in a specific order.
 *
 * @returns {{ enqueue: (operation: () => Promise<any>) => Promise<any>, pending: number, isEmpty: boolean }} An object representing the queue.
 * @property {(operation: () => Promise<any>) => Promise<any>} enqueue Enqueues an asynchronous operation to be executed sequentially.
 * @property {number} pending The number of operations currently in the queue (including the one running).
 * @property {boolean} isEmpty A boolean indicating whether the queue is empty.
 */
function createQueue() {
    let last = Promise.resolve();
    let pendingCount = 0;
    let runningCount = 0;
    const enqueue = (operation, options) => {
        pendingCount++;
        const runOperation = async () => {
            runningCount++;
            try {
                return await operation();
            }
            finally {
                runningCount--;
            }
        };
        let result;
        if (options?.inlineIfRunning) {
            // Explicit nested enqueue requested by the caller (child action).
            // Run inline as a microtask so the parent can await it without deadlock.
            result = Promise.resolve().then(runOperation);
        }
        else {
            // Create the chained promise that will execute the operation
            result = last.then(runOperation);
        }
        const finalized = result.finally(() => {
            pendingCount--;
        });
        // Chain the next operation (with error handling to prevent queue lock)
        // This maintains the sequential order regardless of operation success/failure
        if (options?.inlineIfRunning) {
            // Maintain ordering by ensuring `last` waits for both the previous chain
            // and this inline-started operation to settle. This prevents reordering
            // while still allowing parent/child awaits to proceed.
            last = Promise.all([last, finalized]).then(() => undefined, () => undefined);
        }
        else {
            last = finalized.then(() => undefined, () => undefined);
        }
        return finalized;
    };
    return {
        enqueue,
        // Utility methods for debugging/monitoring
        get pending() { return pendingCount; },
        get isEmpty() { return pendingCount === 0; }
    };
}

function selector(...fns) {
    // Single selector → identity
    if (fns.length === 1) {
        const sel = fns[0];
        return (state) => {
            try {
                const v = sel(state);
                return v == null ? undefined : v;
            }
            catch {
                return undefined;
            }
        };
    }
    const projector = fns[fns.length - 1];
    const inputs = fns.slice(0, -1);
    return (state) => {
        const values = new Array(inputs.length);
        for (let i = 0; i < inputs.length; i++) {
            const v = inputs[i](state);
            if (v == null) {
                return undefined;
            }
            values[i] = v;
        }
        return projector(...values);
    };
}
function selectorAsync(...fns) {
    if (fns.length === 1) {
        const sel = fns[0];
        return async (state) => {
            try {
                const v = await sel(state);
                return v == null ? undefined : v;
            }
            catch {
                return undefined;
            }
        };
    }
    const projector = fns[fns.length - 1];
    const inputs = fns.slice(0, -1);
    return async (state) => {
        const values = new Array(inputs.length);
        for (let i = 0; i < inputs.length; i++) {
            const v = inputs[i](state);
            if (v == null) {
                return undefined;
            }
            values[i] = v;
        }
        return await projector(...values);
    };
}
/**
 * Creates a stream from a selector and a state stream.
 *
 * @param selector - A selector function used to derive a value from the state.
 * @param stateStream - The source stream of state values.
 */
function selectStream(selector, stateStream) {
    return stateStream.pipe(map((state) => selector(state)));
}
/**
 * Creates a stream from an async selector and a state stream.
 *
 * @param selector - An async selector function.
 * @param stateStream - The source stream of state values.
 */
function selectStreamAsync(selector, stateStream) {
    return stateStream.pipe(mergeMap((state) => selector(state)));
}

/**
 * Functional handler for managing actions within middleware.
 *
 * @param {MiddlewareConfig} config - Configuration object for the middleware.
 * @returns {Function} - A function to handle actions.
 */
function createActionHandler(config, options = {}) {
    const getState = config.getState;
    const dependencies = config.dependencies;
    const queue = config.queue ?? { enqueue: async (operation) => operation() };
    const lockThunks = options.lockThunks ?? false;
    const nestedQueue = lockThunks ? createQueue() : null;
    const afterAction = options.afterAction;
    /**
     * Handles the given action, processing it either synchronously or asynchronously.
     *
     * @param {Action | AsyncAction} action - The action to be processed.
     * @param {Function} next - The next middleware function in the chain.
     * @param {any} lockOrNested - Boolean flag or legacy lock arg used to infer nested dispatch.
     * @param {boolean} maybeNestedDispatch - Indicates whether the action is dispatched from within another action.
     * @returns {Promise<void> | void} - A promise if the action is asynchronous, otherwise void.
     */
    const handleAction = async (action, next, lockOrNested = false, maybeNestedDispatch = false) => {
        const isNestedDispatch = typeof lockOrNested === 'boolean' ? lockOrNested : Boolean(maybeNestedDispatch);
        if (typeof action === 'function') {
            const runThunk = async () => action(async (dispatchedAction) => {
                await handleAction(dispatchedAction, next, true);
            }, getState, dependencies());
            await runThunk();
            return;
        }
        else {
            const run = () => queue.enqueue(() => next(action), {
                inlineIfRunning: lockThunks && isNestedDispatch,
            });
            if (lockThunks && isNestedDispatch && nestedQueue) {
                await nestedQueue.enqueue(run);
            }
            else {
                await run();
            }
            if (afterAction) {
                await afterAction(action, next, isNestedDispatch);
            }
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
const createStarter = () => {
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
    function matchesAction(thunk, action) {
        const triggers = thunk.triggers;
        if (!Array.isArray(triggers) || triggers.length === 0)
            return false;
        return triggers.some((t) => {
            if (typeof t === 'string')
                return t === action?.type;
            if (typeof t === 'function') {
                try {
                    return Boolean(t(action));
                }
                catch {
                    return false;
                }
            }
            return false;
        });
    }
    /**
     * Ensures we execute the thunk body rather than the thunk creator itself.
     * Registered thunks are creators, so we call them without arguments to
     * retrieve the actual async action.
     */
    const resolveThunk = (thunk) => {
        if (typeof thunk === 'function' && thunk.isThunk) {
            try {
                return thunk();
            }
            catch (err) {
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
    const exclusive = (config) => {
        const queue = config.queue ?? { enqueue: async (operation) => operation() };
        const onError = console.warn;
        let handler;
        const runTriggeredThunks = async (action, next) => {
            for (const thunk of getRegisteredThunks(config.registry)) {
                if (!matchesAction(thunk, action)) {
                    continue;
                }
                const runnableThunk = resolveThunk(thunk);
                if (!runnableThunk) {
                    continue;
                }
                try {
                    await handler(runnableThunk, next, true);
                }
                catch (err) {
                    const msg = err instanceof Error ? err.message : String(err ?? 'unknown');
                    onError(`[starter] [exclusive] Thunk error while processing action "${action?.type ?? 'unknown'}": ${msg}`);
                }
            }
        };
        handler = createActionHandler(config, {
            lockThunks: true,
            afterAction: async (action, next) => {
                await runTriggeredThunks(action, next);
            },
        });
        return (next) => async (action) => {
            return queue.enqueue(async () => {
                try {
                    await handler(action, next, true);
                }
                catch (err) {
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
    const concurrent = (config) => {
        const inflight = new Set();
        const onError = console.warn;
        let handler;
        const runTriggeredThunks = async (action, next) => {
            const matching = getRegisteredThunks(config.registry)
                .filter((thunk) => matchesAction(thunk, action));
            const results = await Promise.allSettled(matching
                .map(resolveThunk)
                .filter(Boolean)
                .map((thunk) => handler(thunk, next, true)));
            for (const r of results) {
                if (r.status === 'rejected') {
                    const msg = r.reason instanceof Error
                        ? r.reason.message
                        : String(r.reason ?? 'unknown');
                    onError(`[starter] [concurrent] Thunk error while processing action "${action?.type ?? 'unknown'}": ${msg}`);
                }
            }
        };
        handler = createActionHandler(config, {
            lockThunks: false,
            afterAction: async (action, next) => {
                await runTriggeredThunks(action, next);
            },
        });
        // Attach small control surface for diagnostics/teardown
        const middleware = (next) => {
            // expose helpers on the returned function (non-enumerable to be unobtrusive)
            const fn = async (action) => {
                // DO NOT await; return quickly for true concurrency
                const p = (async () => {
                    try {
                        // handle main action
                        await handler(action, next);
                    }
                    catch (err) {
                        const msg = err instanceof Error ? err.message : String(err ?? 'unknown');
                        onError(`[starter] [concurrent] Unhandled error while processing action "${action?.type ?? 'unknown'}": ${msg}`);
                        return;
                    }
                })();
                inflight.add(p);
                // ensure cleanup + error reporting
                p.catch(err => {
                    const msg = err instanceof Error ? err.message : String(err ?? 'unknown');
                    onError(`[starter] [concurrent] Unhandled error while processing action "${action?.type ?? 'unknown'}": ${msg}`);
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
                        if (inflight.size === 0)
                            return [];
                        // Snapshot to avoid mutation while awaiting
                        return Promise.allSettled(Array.from(inflight));
                    },
                },
            });
            return fn;
        };
        return middleware;
    };
    // Map strategy names to functions
    const strategies = {
        'exclusive': exclusive,
        'concurrent': concurrent
    };
    const defaultStrategy = 'concurrent';
    // Create a method to select the strategy
    const selectStrategy = ({ dispatch, getState, dependencies, strategy, queue, stack, registry }) => (next) => {
        let strategyName;
        try {
            strategyName = String(strategy?.());
        }
        catch {
            strategyName = 'unknown';
        }
        let strategyFunc = strategies[strategyName];
        if (!strategyFunc) {
            console.warn(`[starter] Unknown strategy: ${strategyName}, default is used: ${defaultStrategy}`);
            strategyFunc = strategies[defaultStrategy];
        }
        return strategyFunc({ dispatch, getState, dependencies, queue, stack, registry })(next);
    };
    selectStrategy.signature = 'i.p.5.j.7.0.2.1.8.b';
    return selectStrategy;
};
// Create the starter middleware
/**
 * Default starter middleware instance.
 */
const starter = createStarter();

function getProperty(obj, path) {
    // Handle global state request
    if (path === '*') {
        return obj;
    }
    if (obj === undefined || obj === null) {
        return undefined;
    }
    // Handle string path (single key)
    if (typeof path === 'string') {
        return obj?.[path];
    }
    // Handle array path (nested keys)
    if (Array.isArray(path)) {
        if (path.length === 0) {
            return obj;
        }
        let current = obj;
        for (const rawKey of path) {
            if (current === undefined || current === null)
                return undefined;
            const key = typeof rawKey === 'number'
                ? rawKey
                : typeof rawKey === 'string' && /^[0-9]+$/.test(rawKey)
                    ? Number(rawKey)
                    : rawKey;
            current = current?.[key];
        }
        return current;
    }
    // Handle unsupported path types
    console.warn('Unsupported type of path parameter');
    return undefined;
}
function setProperty(obj, path, value) {
    // Handle global state update
    if (path === '*') {
        return value;
    }
    const isIndexKey = (key) => (typeof key === 'number' && Number.isInteger(key) && key >= 0) ||
        (typeof key === 'string' && /^[0-9]+$/.test(key));
    const normalizeKey = (key) => {
        if (typeof key === 'number')
            return key;
        if (typeof key === 'string' && isIndexKey(key))
            return Number(key);
        return String(key);
    };
    const ensureContainerForNextKey = (nextKey) => isIndexKey(nextKey) ? [] : {};
    const readCurrent = (root, keys) => {
        let current = root;
        for (const key of keys) {
            if (current === undefined || current === null)
                return undefined;
            current = current[key];
        }
        return current;
    };
    const writePath = (root, keys, leafValue) => {
        const createClone = (node, nextKey) => {
            if (Array.isArray(node))
                return node.slice();
            if (node && typeof node === 'object')
                return { ...node };
            return ensureContainerForNextKey(nextKey);
        };
        const newRoot = createClone(root, keys[0]);
        let cursor = newRoot;
        let sourceCursor = root;
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (i === keys.length - 1) {
                cursor[key] = leafValue;
                break;
            }
            const nextKey = keys[i + 1];
            const existingNext = sourceCursor?.[key];
            const nextNode = existingNext && typeof existingNext === 'object'
                ? createClone(existingNext, nextKey)
                : ensureContainerForNextKey(nextKey);
            cursor[key] = nextNode;
            cursor = nextNode;
            sourceCursor = existingNext;
        }
        return newRoot;
    };
    // Handle string path (single key)
    if (typeof path === 'string') {
        const currentValue = obj?.[path];
        if (currentValue === value)
            return obj;
        if (currentValue === undefined && value === undefined)
            return obj;
        if (obj === undefined || obj === null || typeof obj !== 'object') {
            return { [path]: value };
        }
        return { ...obj, [path]: value };
    }
    // Handle array path (nested keys)
    if (Array.isArray(path)) {
        if (path.length === 0)
            return value;
        const keys = path.map(normalizeKey);
        const currentValue = readCurrent(obj, keys);
        if (currentValue === value)
            return obj;
        if (currentValue === undefined && value === undefined)
            return obj;
        return writePath(obj, keys, value);
    }
    // Handle unsupported path types
    console.warn('Unsupported type of path parameter');
    return obj; // Return the object unchanged
}
/**
 * Combines multiple store enhancers into a single enhancer function.
 * This allows multiple enhancers to be applied in sequence to the store.
 * Typically used for combining middleware, logging, or other store customizations.
 *
 * @param enhancers - An array of store enhancers to be combined.
 * @returns A single store enhancer that applies all provided enhancers.
 */
function combineEnhancers(...enhancers) {
    const active = enhancers.filter(Boolean);
    // Identity enhancer for convenience.
    if (active.length === 0) {
        return (next) => next;
    }
    const combinedEnhancer = (next) => active.reduce((acc, enhancer) => enhancer(acc), next);
    return combinedEnhancer;
}
/**
 * Deeply merges two objects, combining nested trees of state.
 *
 * This function recursively merges properties of the `source` object into
 * the `target` object. If a key exists in both and both values are plain
 * objects, their contents are merged. Arrays and non-object values are overwritten.
 *
 * @template T - The type of the target object.
 * @template S - The type of the source object.
 * @param {T} target - The target object to merge into.
 * @param {S} source - The source object to merge from.
 * @returns {T & S} - A new object that is the result of deeply merging `target` and `source`.
 *
 * @example
 * const a = { foo: { bar: 1 }, baz: 2 };
 * const b = { foo: { qux: 3 } };
 * const result = deepMerge(a, b);
 * // result -> { foo: { bar: 1, qux: 3 }, baz: 2 }
 */
function deepMerge(target, source) {
    if (source === undefined || source === null)
        return target;
    if (target === undefined || target === null)
        return source;
    const output = { ...target };
    for (const key of Object.keys(source)) {
        if (typeof source[key] === 'object' &&
            source[key] !== null &&
            !Array.isArray(source[key])) {
            output[key] = deepMerge(output[key] ?? {}, source[key]);
        }
        else {
            output[key] = source[key];
        }
    }
    return output;
}
/**
 * Combines reducers into a single reducer function.
 * Initializes the default state by invoking each reducer with `undefined` and a special `@@INIT` action.
 */
const combineReducers = (reducers) => {
    /**
     * Helper to validate reducers and flatten them into a single map.
     *
     * This recursively flattens the nested reducer tree and ensures all reducer paths are captured in the map.
     */
    const flattenReducers = (tree, path = []) => {
        const reducerMap = new Map();
        for (const key in tree) {
            const reducer = tree[key];
            const currentPath = [...path, key];
            if (typeof reducer === "function") {
                reducerMap.set(currentPath.join("."), { reducer, path: currentPath });
            }
            else if (typeof reducer === "object" && reducer !== null) {
                // Recursively flatten the nested reducers.
                const childReducers = flattenReducers(reducer, currentPath);
                childReducers.forEach((childReducer, childKey) => {
                    reducerMap.set(childKey, childReducer);
                });
            }
            else {
                throw new Error(`Invalid reducer at path: ${currentPath.join(".")}`);
            }
        }
        return reducerMap;
    };
    const reducerMap = flattenReducers(reducers);
    /**
     * Helper to build the initial state by calling reducers with undefined state and a special `@@INIT` action.
     *
     * It gathers the initial state for each reducer, ensuring the nested structure is respected.
     */
    const gatherInitialState = async () => {
        const initialState = {};
        for (const { reducer, path } of reducerMap.values()) {
            const key = path[path.length - 1]; // Get the last key in the path as the state slice
            try {
                const initState = await reducer(undefined, { type: "@@INIT" });
                let cursor = initialState;
                for (let i = 0; i < path.length - 1; i++) {
                    cursor[path[i]] = cursor[path[i]] || {};
                    cursor = cursor[path[i]];
                }
                cursor[key] = initState;
            }
            catch (error) {
                console.error(`Error initializing state at path "${path.join('.')}" with action "@@INIT": ${error.message}`);
            }
        }
        return initialState;
    };
    /**
     * Combined reducer function.
     *
     * It processes each reducer asynchronously and ensures the state is only updated if necessary.
     */
    return async (state, action) => {
        if (state === undefined) {
            state = await gatherInitialState();
            if (action?.type === '@@INIT')
                return state;
        }
        let hasChanged = false;
        const modified = {}; // To track the modifications
        // Process each reducer in the flattened reducer map
        for (const { reducer, path } of reducerMap.values()) {
            const key = path[path.length - 1];
            const currentState = path.reduce((acc, key) => acc[key], state);
            try {
                const updatedState = await reducer(currentState, action);
                if (currentState !== updatedState) {
                    hasChanged = true;
                    // Apply the change to the state using applyChange
                    state = await applyChange(state, path, updatedState, modified);
                }
            }
            catch (error) {
                console.error(`Error processing reducer at "${path.join(".")}" with action "${action.type}": ${error.message}`);
            }
        }
        // If nothing changed, `state` is still the previous reference.
        return state;
    };
};
/**
 * Updates a nested state object by applying a change to the specified path and value.
 * Ensures that intermediate nodes in the state are properly cloned or created, preserving immutability
 * for unchanged branches. Tracks visited nodes in the provided object tree to avoid redundant updates.
 */
function applyChange(initialState, path, value, objTree) {
    let currentState = Object.keys(objTree).length > 0 ? initialState : { ...initialState };
    let currentObj = currentState;
    for (let i = 0; i < path.length; i++) {
        const key = path[i];
        if (i === path.length - 1) {
            // Reached the leaf node, update its value
            currentObj[key] = value;
            objTree[key] = true;
        }
        else {
            // Continue traversal
            currentObj = currentObj[key] = objTree[key] ? currentObj[key] : { ...currentObj[key] };
            objTree = (objTree[key] = objTree[key] ?? {});
        }
    }
    return currentState;
}
/**
 * Applies middleware to the store's dispatch function.
 * Middleware enhances the dispatch function, allowing actions to be intercepted and modified.
 *
 * @param {...Function[]} middlewares Middleware functions to apply.
 * @returns A store enhancer that applies the middleware to the store.
 */
const applyMiddleware = (...middlewares) => {
    const enhancer = (next) => (settings, enhancer) => {
        // Create the store with the original reducer and enhancer
        const store = next(settings, enhancer);
        // Define middleware API
        const middlewareAPI = store.middlewareAPI;
        // Build middleware chain
        const chain = [];
        for (let i = 0; i < middlewares.length; i++) {
            chain.push(middlewares[i](middlewareAPI));
        }
        // Compose the middleware chain into a single dispatch function
        const dispatch = chain.reduceRight((next, middleware) => middleware(next), store.dispatch);
        // Return the enhanced store
        return {
            ...store,
            dispatch, // Overwrite dispatch with the enhanced dispatch
        };
    };
    // Ensure the 'name' property is properly set for the enhancer
    Object.defineProperty(enhancer, 'name', { value: 'applyMiddleware' });
    return enhancer;
};

/**
 * The default settings for the store that configure various behaviors such as action dispatch
 * and reducer handling.
 */
const defaultStoreSettings = {
    awaitStatePropagation: false,
    dispatchSystemActions: true,
    enableGlobalReducers: true,
    exclusiveActionProcessing: false,
};
/**
 * Checks whether an action type belongs to the internal system namespace.
 *
 * @param type - Action type string to check.
 * @returns True when the type starts with "system/".
 */
function isSystemActionType(type) {
    return typeof type === 'string' && type.startsWith('system/');
}
function createSystemModule() {
    return createModule({
        slice: 'system',
        initialState: {
            _initialized: false,
            _ready: false,
            _modules: [],
        },
        actions: {
            initializeState: createAction('INITIALIZE_STATE', (_state) => ({
                _modules: [],
                _initialized: false,
                _ready: false,
            })),
            updateState: createAction('UPDATE_STATE', (state, payload) => ({
                ...(state ?? {}),
                ...payload,
            })),
            storeInitialized: createAction('STORE_INITIALIZED', (state) => ({
                ...(state ?? {}),
                _initialized: true,
                _ready: true,
            })),
            moduleLoaded: createAction('MODULE_LOADED', (state, payload) => ({
                ...(state ?? { _modules: [] }),
                _modules: [...(state?._modules ?? []), payload.slice],
            })),
            moduleUnloaded: createAction('MODULE_UNLOADED', (state, payload) => ({
                ...(state ?? { _modules: [] }),
                _modules: (state?._modules ?? []).filter((m) => m !== payload.slice),
            })),
        },
        selectors: {
            isInitialized: (state) => state._initialized,
            isReady: (state) => state._ready,
            loadedModules: (state) => state._modules,
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
function createStore(storeSettingsOrEnhancer, enhancer) {
    const systemModule = createSystemModule();
    let modules = [];
    let sysActions = systemModule.actions;
    let reducers = [];
    const registry = createActionRegistry();
    // Determine if the second argument is storeSettings or enhancer
    let settings;
    if (typeof storeSettingsOrEnhancer === 'function') {
        // If it's a function, it's the enhancer
        enhancer = storeSettingsOrEnhancer;
        settings = defaultStoreSettings; // Use default settings if not provided
    }
    else {
        // Otherwise, it's storeSettings
        settings = { ...defaultStoreSettings, ...storeSettingsOrEnhancer };
    }
    // Configure store pipeline
    let pipeline = {
        dependencies: {},
        strategy: settings.exclusiveActionProcessing ? 'exclusive' : 'concurrent',
    };
    let state = {};
    let currentState = createBehaviorSubject(state);
    const queue = createQueue();
    /**
     * Dispatches an action to update the global state.
     *
     * The function validates the action to ensure it is a plain object with a defined and string type property.
     * If any validation fails, a warning is logged to the console and the action is not dispatched.
     * After validation, the action is processed by the reducer, and the global state is updated accordingly.
     */
    let dispatch = async (action) => {
        if (typeof action === 'function') {
            await action((nestedAction) => store.dispatch(nestedAction), () => state, pipeline.dependencies);
            return;
        }
        if (!action || typeof action !== 'object' || typeof action.type !== 'string') {
            console.warn('Invalid action dispatched:', action);
            return;
        }
        let newState = state; // start with current state
        const handler = getActionHandlers(action.type, registry);
        if (handler) {
            const slicePath = action.type.split('/').slice(0, -1); // handles 'foo/bar/ACTION'
            const currentSliceState = getProperty(newState, slicePath);
            const updatedSliceState = await handler(currentSliceState, action.payload);
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
                }
                catch (err) {
                    console.warn(`Error in meta-reducer ${i}:`, err.message ?? err);
                }
            }
        }
        // Emit only once after all reducers have run
        if (newState !== state) {
            state = newState;
            currentState.next(state);
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
    const processDependencies = (source, processed = {}, origin = '') => {
        if (Array.isArray(source)) {
            return source.map((item) => processDependencies(item, processed));
        }
        if (source && typeof source === 'object') {
            // Check if the source is a plain object
            if (typeof source.constructor === 'function' &&
                source.constructor !== Object) {
                return source;
            }
            else {
                for (const [key, value] of Object.entries(source)) {
                    if (!processed.hasOwnProperty(key)) {
                        processed[key] = processDependencies(value, processed, origin);
                    }
                    else {
                        console.warn(`Overlapping property '${key}' found in dependencies from module: ${origin}. The existing value will be preserved.`);
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
    const injectDependencies = () => {
        const allDependencies = [...modules].reduce((acc, module) => {
            return processDependencies(module.dependencies, acc, module.slice);
        }, {});
        pipeline.dependencies = allDependencies;
    };
    /**
     * Removes the specified module's dependencies from the pipeline and updates
     * the global dependencies object, ensuring proper handling of nested structures.
     */
    const ejectDependencies = (module) => {
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
    const populate = async (...moduleList) => {
        return queue.enqueue(async () => {
            // Load modules sequentially within the same queue operation
            for (const module of moduleList) {
                if (modules.some((m) => m.slice === module.slice)) {
                    console.warn(`Module ${module.slice} already loaded, skipping`);
                    continue;
                }
                try {
                    if (typeof module.configure === 'function') {
                        module.configure(store);
                    }
                    // Register the module first
                    modules = [...modules, module];
                    // Register action handlers
                    registerActionHandlers(module, registry);
                    registerThunks(module, registry);
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
                }
                catch (error) {
                    console.warn(`Failed to load module ${module.slice}:`, error);
                    // Clean up on failure
                    modules = modules.filter((m) => m.slice !== module.slice);
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
    const loadModule = async (module) => {
        if (modules.some((m) => m.slice === module.slice)) {
            return Promise.resolve(); // Already loaded
        }
        module.configure(store);
        return queue.enqueue(async () => {
            // Register the module
            modules = [...modules, module];
            registerActionHandlers(module, registry);
            registerThunks(module, registry);
            // Inject dependencies
            injectDependencies();
            const slicePath = (module.slice || 'main').split('/');
            if (getProperty(state, slicePath) === undefined) {
                state = setProperty(state, slicePath, module.initialState);
            }
            sysActions.moduleLoaded(module);
            currentState.next(state);
        });
    };
    /**
     * Unloads a feature module from the store, optionally clearing its state.
     * It removes the module, ejects its dependencies, and updates the global state.
     * A `moduleUnloaded` action is dispatched after the module is unloaded.
     */
    const unloadModule = async (module, clearState = false) => {
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
    const normalizePath = (path) => {
        return typeof path === 'string' ? path.split('/') : [...path];
    };
    const middlewareAPI = {
        getState: (slice) => getProperty(state, slice === undefined ? '*' : slice === '*' ? '*' : normalizePath(slice)),
        dispatch: (action) => store.dispatch(action),
        dependencies: () => pipeline.dependencies,
        strategy: () => pipeline.strategy,
        queue,
        registry,
    };
    /**
     * Reads the state slice and executes the provided callback with the current state.
     * The function ensures that state is accessed in a thread-safe manner by using the store queue.
     */
    const getState = (slice, callback) => {
        return queue.enqueue(async () => {
            const path = slice === '*' ? '*' : normalizePath(slice);
            const stateRead = getProperty(state, path);
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
    const select = (selector, defaultValue) => {
        const subscribe = (callbackOrReceiver) => {
            const receiver = createReceiver(callbackOrReceiver);
            let hasValue = false;
            let lastValue = defaultValue;
            let stopped = false;
            let sourceSubscription;
            const resolveSelected = async (state) => {
                if (state == null) {
                    return defaultValue;
                }
                try {
                    const value = await selector(state);
                    return value === undefined ? defaultValue : value;
                }
                catch (err) {
                    console.warn(`Error in selector: ${err?.message ?? err}`);
                    return defaultValue;
                }
            };
            sourceSubscription = currentState.subscribe({
                next: async (state) => {
                    if (stopped || receiver.completed) {
                        return;
                    }
                    const selected = await resolveSelected(state);
                    if (hasValue && Object.is(lastValue, selected)) {
                        return;
                    }
                    hasValue = true;
                    lastValue = selected;
                    try {
                        await receiver.next(selected);
                    }
                    catch (err) {
                        try {
                            await receiver.error(err);
                        }
                        finally {
                            await sourceSubscription?.unsubscribe?.();
                        }
                    }
                },
                error: async (err) => {
                    await receiver.error(err);
                },
                complete: async () => {
                    await receiver.complete();
                },
            });
            return createSubscription(async () => {
                stopped = true;
                await sourceSubscription?.unsubscribe?.();
            });
        };
        let stream;
        stream = {
            type: 'stream',
            name: 'select',
            pipe: ((...ops) => pipeSourceThrough(stream, ops)),
            subscribe,
            query: () => firstValueFrom(stream),
            [Symbol.asyncIterator]: () => {
                const factory = createAsyncIterator({
                    register: (receiver) => subscribe(receiver),
                });
                return factory();
            },
        };
        return stream;
    };
    /**
     * Registers a global reducer that runs on every dispatched action.
     */
    const addReducer = (reducer) => {
        void queue.enqueue(async () => {
            if (!settings.enableGlobalReducers) {
                console.warn('Global reducers are disabled; this reducer will not be used unless "enableGlobalReducers" is true.');
                return;
            }
            reducers.push(reducer);
        });
    };
    let store;
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
    const initializeStore = (storeInstance) => {
        // Bind system actions using the store's dispatch method
        registerModule(storeInstance, systemModule);
        sysActions = systemModule.actions;
        // Initialize state and mark store as initialized
        sysActions.initializeState();
        console.log('%cYou are using ActionStack. Happy coding! 🎉', 'font-weight: bold;');
        sysActions.storeInitialized();
    };
    // Always run the starter middleware as the outermost middleware layer,
    // so it executes before any user-applied middlewares.
    const applyStarterMiddleware = (next) => (settings, enhancer) => {
        const store = next(settings, enhancer);
        const starterDispatch = store.starter(store.middlewareAPI)(store.dispatch);
        return { ...store, dispatch: starterDispatch };
    };
    enhancer = combineEnhancers(enhancer, applyStarterMiddleware);
    store = enhancer(() => store)(settings);
    let originalDispatch = store.dispatch;
    store.dispatch = (action) => {
        // Fast path: avoid creating closures/promises if no tracking is needed
        if (!settings.awaitStatePropagation) {
            return originalDispatch(action);
        }
        let result;
        // Preserve dispatch return value
        result = originalDispatch(action);
        // Support async dispatch (thunks, effects, etc.)
        return Promise.resolve(result).then(async () => {
            await waitForBrowserIdle();
            return result;
        });
    };
    initializeStore(store);
    return store;
}

/*
 * Public API Surface of actionstack
 */

/**
 * Generated bundle index. Do not edit.
 */

export { createAction as action, applyChange, applyMiddleware, bindActionCreator, bindActionCreators, combineEnhancers, combineReducers, createAction, createActionHandler, createActionRegistry, createModule, createQueue, createStarter, createStore, createThunk, deepMerge, generateToken, getActionHandlers, getProperty, getRegisteredThunks, hash, isAction, isAsync, isBoxed, isPlainObject, isPromise, isStream, isSystemActionType, isValidToken, kindOf, populateStore, registerActionHandlers, registerModule, registerThunks, salt, selectStream, selectStreamAsync, selector, selectorAsync, setProperty, starter, createThunk as thunk, unregisterActionHandlers, unregisterModule, unregisterThunks, waitForBrowserIdle };
//# sourceMappingURL=epikodelabs-actionstack.mjs.map
