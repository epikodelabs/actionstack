import { Subject, Stream } from '@epikodelabs/streamix';

/**
 * A cancelable promise.
 *
 * Note: Implementations should be Promise-compatible (including `[Symbol.toStringTag]`)
 * so they are assignable to `Promise<T>`.
 */
type CancelablePromise<T = any> = Promise<T> & {
    cancel(): void;
};
/**
 * Describes a standard action object used to signal state changes.
 *
 * Actions are dispatched to update the state in ActionStack-like stores.
 *
 * @template T - Type of the action payload. Defaults to `any`.
 */
interface Action<T = any> {
    type: string;
    payload?: T;
    error?: boolean;
    meta?: any;
    source?: any;
}
/**
 * Dispatch function signature for synchronous actions and thunks.
 *
 * @template TState - The store state shape.
 * @template TDependencies - Dependencies available to async actions.
 */
type Dispatch<TState = any, TDependencies = any> = (action: Action | AsyncAction<TState, TDependencies>) => Promise<void>;
/**
 * Getter function for the current store state.
 *
 * @template TState - The store state shape.
 */
type GetState<TState = any> = () => TState;
/**
 * Represents an asynchronous action (thunk) that can dispatch other actions and access state.
 *
 * Used for side effects and complex state flows. Receives utilities for dispatching, reading state,
 * and accessing app-level dependencies.
 *
 * @template TState - The shape of the application or relevant state.
 * @template TDependencies - The structure of the dependencies object.
 *
 * @param dispatch - Function to dispatch synchronous or asynchronous actions.
 * @param getState - Function to retrieve the current state.
 * @param dependencies - Application dependencies injected into async logic.
 * @returns A Promise that resolves when the async operation finishes.
 */
interface AsyncAction<TState = any, TDependencies = any> {
    (dispatch: Dispatch<TState, TDependencies>, getState: GetState<TState>, dependencies: TDependencies): Promise<void>;
}
/**
 * Creates a synchronous action with optional metadata and helpers for identification.
 *
 * @template TPayload - Type of the payload for the created action.
 * @template TType - String literal type of the action.
 * @template TArgs - Argument types accepted by the action creator function.
 *
 * @returns A function that produces an {@link Action} when invoked, with metadata for matching and debugging.
 */
type ActionCreator<TPayload = any, TType extends string = string, TArgs extends readonly any[] = any[]> = ((...args: TArgs) => Action<TPayload>) & {
    handler: ActionHandler<any, TPayload>;
    toString(): string;
    type: TType;
    match(action: unknown): action is Action<TPayload>;
};
/**
 * Defines the trigger types supported by thunks.
 *
 * - `string`: matches an action by its `type`
 * - `(action) => boolean`: custom predicate matcher
 */
type ThunkTrigger<TAction extends Action<any> = Action<any>> = string | ((action: TAction) => boolean);
/**
 * An async thunk action (function) with attached metadata used by the starter middleware.
 */
type ThunkAction<TState = any, TDependencies = any> = AsyncAction<TState, TDependencies> & {
    type: string;
    toString: () => string;
    match: (action: unknown) => action is Action<any>;
    isThunk: true;
    triggers?: ReadonlyArray<ThunkTrigger>;
};
/**
 * A factory for creating asynchronous actions (thunks) with built-in metadata.
 *
 * @template T - The string type identifier for the thunk.
 * @template Thunk - The thunk function type (typically {@link AsyncAction}).
 * @template Args - Argument types accepted by the thunk creator function.
 *
 * @property type - Unique string identifier for this thunk.
 * @property toString - Returns the thunk's type string.
 * @property match - Determines if a given action matches this thunk.
 * @property isThunk - Always `true`, used to distinguish thunks from normal actions.
 *
 * @returns A callable that produces an {@link AsyncAction} when invoked with `Args`.
 */
type ThunkCreator<TType extends string = string, TState = any, TDependencies = any, TArgs extends readonly any[] = any[]> = ((...args: TArgs) => ThunkAction<TState, TDependencies>) & {
    type: TType;
    toString: () => TType;
    match: (action: unknown) => action is Action<any>;
    isThunk: true;
    triggers?: ReadonlyArray<ThunkTrigger>;
};
/**
 * @template T - The type of the state slice that this handler operates on.
 *
 * Defines a function that handles a specific action type to update state.
 *
 * An `ActionHandler` receives the current state of a slice and the payload
 * of the action that triggered it. It is responsible for computing and
 * returning the new state for that slice. The handler can be synchronous
 * (returning `T`) or asynchronous (returning `Promise<T>`), though typically
 * state updates themselves are synchronous results of an async action having completed its side effects.
 *
 * @param {T} state - The current state of the slice.
 * @param {any} [payload] - The payload of the action that triggered this handler. Optional, as not all actions have payloads.
 * @returns {T | Promise<T>} The new state of the slice, or a Promise resolving to the new state.
 */
type ActionHandler<State = any, Payload = any> = (state: State, payload: Payload) => State | Promise<State>;
/**
 * Per-store registry for action handlers and thunks.
 * Keeping these isolated prevents collisions when multiple stores exist.
 */
interface ActionRegistry {
    actionHandlers: Map<string, ActionHandler>;
    registeredThunks: Map<string, ThunkCreator>;
}
/**
 * A function that takes the current state and an action, and returns
 * the updated state (excluding promises).
 */
type Reducer<T = any> = (state: T, action: Action) => T;
/**
 * Type alias for an asynchronous reducer function.
 *
 * An asynchronous reducer takes the current state and an action object and returns a Promise
 * that resolves to the updated state.
 *
 * @param state - The current state of the application.
 * @param action - The action object being dispatched.
 * @returns A Promise resolving to the updated state.
 */
type AsyncReducer<T = any> = (state: T, action: Action) => Promise<T>;
/**
 * Defines the methods and properties available to middleware for interacting with the store.
 * Provides access to state, dispatching actions, dependencies, processing strategy,
 * synchronization, and execution stack.
 *
 * @property {function([string[]]): any} getState - Retrieves the state or a specific slice of the state.
 * @property {function(Action|AsyncAction): Promise<void>} dispatch - Dispatches an action (synchronous or asynchronous).
 * @property {function(): any} dependencies - Retrieves the current dependencies in the pipeline.
 * @property {function(): ProcessingStrategy} strategy - Retrieves the current processing strategy.
 * @property {ActionQueue} queue - A queue to serialize store operations and middleware dispatches.
 */
type MiddlewareAPI<TState = any, TDependencies = any> = {
    getState: (slice?: string | string[] | '*') => any;
    dispatch: Dispatch<TState, TDependencies>;
    dependencies: () => TDependencies;
    strategy: () => ProcessingStrategy;
    queue: ActionQueue;
    registry: ActionRegistry;
};
/**
 * Interface defining the structure of a middleware function.
 *
 * Middleware functions are used to intercept, handle, and potentially modify the dispatching process in ActionStack-like stores.
 * This interface defines the expected behavior for a middleware function.
 *
 * @property (api: Store) => (next: Function) => (action: any) => Promise<any> | any
 *  - A function that takes the store instance as an argument.
 *  - It returns another function that takes the `next` function in the middleware chain as an argument.
 *  - The inner function can perform logic before and/or after calling the `next` function with the action.
 *  - It can optionally return a promise that resolves to a modified version of the `next` function,
 *      allowing for asynchronous middleware behavior.
 *  - Alternatively, it can return any value to potentially short-circuit the middleware chain.
 *
 * @property signature?: string (optional)
 *  - An optional string property that can be used to define a signature for the middleware,
 *      aiding in type checking and documentation.
 */
interface Middleware {
    (api: MiddlewareAPI): (next: Function) => (action: Action | AsyncAction) => Promise<any> | any;
    signature?: string;
}
/**
 * Represents an observer that receives notifications of values from an Stream.
 * @interface
 * @template T The type of the value being observed.
 */
interface Observer<T> {
    next: (value: T) => void;
    error: (err: any) => void;
    complete: () => void;
}
/**
 * Represents an asynchronous observer that receives notifications of values from an Stream.
 * @interface
 * @template T The type of the value being observed.
 */
interface AsyncObserver<T> {
    next: (value: T) => Promise<void>;
    error: (err: any) => Promise<void>;
    complete: () => Promise<void>;
}
/**
 * Interface representing an operator function for transforming streams.
 *
 * An operator function takes an input `Stream<T>` and returns an output `Stream<R>`.
 *
 * @typeParam T - The type of the input elements.
 * @typeParam R - The type of the output elements.
 */
interface OperatorFunction<T, R> {
    (source: Stream<T>): Stream<R>;
}
/**
 * Type alias for any function that takes any number of arguments and returns anything.
 *
 * This type is used to represent a generic function without specifying a specific argument or return type.
 * It can be helpful for situations where the exact function signature is not important.
 */
type AnyFn = (...args: any[]) => any;
/**
 * Interface defining the structure of a selector function.
 *
 * Selectors are functions that extract specific data or derived values from the ActionStack store's state.
 *
 * @param state - The current state of the application.
 * @param props - Optional props object that can be used by the selector for additional logic.
 * @returns any - The selected value or derived data from the state.
 */
type SelectorFunction<S = any, R = any> = (state: S, props?: any) => Promise<R> | R;
/**
 * Interface defining the structure of a projection function.
 *
 * Projection functions are similar to selector functions, but they can handle projecting data from
 * either a single state object or an array of state objects.
 *
 * @param results - The current state(s) of the application (can be a single object or an array of state objects).
 * @param props - Optional props object that can be used by the projection function for additional logic.
 * @returns any - The projected value or derived data from the state.
 */
type ProjectionFunction<R = any, P = any> = (results: any[], props?: P) => R;
/**
 * Type alias representing a recursive tree structure.
 *
 * This type is used to define nested objects in a hierarchical way.
 * - `LeafType`: The type for the leaf nodes of the tree (representing the base values).
 * - `T`: Optional type parameter for the root object type (defaults to `any`).
 *
 * The structure works as follows:
 *  - For each property key `K` in the root object type `T`:
 *      - If the property value `T[K]` is an object:
 *          - The type for that property becomes another `Tree` instance, recursively defining the nested structure.
 *      - If the property value `T[K]` is not an object:
 *          - The type for that property becomes the `LeafType`.
 *
 * This type allows for representing complex object structures with nested objects and leaf nodes.
 */
type Tree<LeafType, T = any> = {
    [K in keyof T]: T[K] extends object ? Tree<LeafType, T[K]> : LeafType;
};
/**
 * Type alias representing processing strategies for side epics.
 *
 */
type ProcessingStrategy = "exclusive" | "concurrent";
/**
 * Type alias representing slice strategies.
 *
 */
type SliceStrategy = "persistent" | "temporary";
/**
 * Maps selector definitions to stream factory functions.
 */
type Streams<S extends Record<string, (state: any) => any>> = {
    [K in keyof S]: () => Stream<ReturnType<S[K]>>;
};
/**
 * Represents a feature module that organizes state, logic, and dependencies
 * for a specific part of an application.
 *
 * @template State - The type of the feature state slice.
 * @template ActionTypes - The union type of action type strings.
 * @template Actions - The shape of action creator functions.
 * @template Selectors - The shape of selector functions.
 * @template Dependencies - The type representing dependencies required by the feature.
 *
 * @property slice - A unique identifier string for the feature's state slice in the store.
 * @property initialState - The initial state value for this feature slice.
 * @property actionHandlers - A map of action type strings to their respective reducer functions
 *                            that handle updates to the feature state.
 * @property actions - An object containing action creator functions.
 * @property selectors - An object containing selector functions to derive data from the state.
 * @property dependencies? - Optional dependencies tree, such as types or injection tokens,
 *                           which the feature module requires.
 * @property [key: string] - Allows for additional arbitrary properties.
 */
interface FeatureModule<State = any, ActionTypes extends string = string, Actions extends Record<string, (...args: any[]) => Action<any>> = any, Selectors extends Record<string, (state: any) => any> = any, Dependencies = any> {
    readonly slice: string;
    readonly initialState: State;
    readonly dependencies?: Dependencies;
    readonly loaded$: Subject<void>;
    readonly destroyed$: Subject<void>;
    readonly data$: Streams<Selectors>;
    readonly actions: Actions;
    readonly selectors: Selectors;
    init: (store: Store<any>) => FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>;
    configure: (store: Store<State>) => FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>;
    destroy: (clearState?: boolean) => FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>;
}
/**
 * Type definition for a function that creates a store instance.
 *
 * @template T - The type of the state managed by the store.
 * @param {StoreSettings} [settings] - Optional settings for the store, such as dispatch behavior or feature toggles.
 * @param {StoreEnhancer} [enhancer] - Optional enhancer function to extend or modify the store's functionality.
 * @returns {Store<T>} The created store instance with methods for managing state and actions.
 */
type StoreCreator<T = any> = (settings?: StoreSettings, enhancer?: StoreEnhancer) => Store<T>;
/**
 * Type alias for a store enhancer function.
 *
 * This type represents a function that takes the next store creation function as an argument,
 * and returns a new store creation function potentially with additional functionality.
 * Store enhancers are used to extend the capabilities of the store creation process.
 *
 * @param next - The next store creation function in the chain (typically the default store creator).
 * @returns StoreCreator - A new store creation function that potentially wraps the original one
 *                         and provides additional functionality.
 */
type StoreEnhancer = (next: StoreCreator) => StoreCreator;
/**
 * Determines the type of a given value.
 *
 * This function attempts to identify the underlying type of a JavaScript value
 * using a combination of checks and built-in functions.
 *
 * @param val - The value to determine the type for.
 * @returns string - A string representing the type of the value (e.g., "undefined", "string", "array", etc.).
 */
declare function kindOf(val: any): string;
/**
 * Checks if a value is a boxed primitive.
 *
 * This function checks if a value is not `undefined` or `null`, and its value doesn't strictly equal itself when called with `valueOf()`.
 * Primitive values wrapped in their corresponding object representations (e.g., new Number(10)) are considered boxed.
 *
 * @param value - The value to check if it's boxed.
 * @returns boolean - True if the value is a boxed primitive, false otherwise.
 */
declare function isBoxed(value: any): boolean;
/**
 * Checks if a value is a Promise object.
 *
 * This function uses a trick to identify promises. It resolves the value with `Promise.resolve` and compares the resolved value with the original value.
 * If they are the same, it's likely a promise.
 *
 * @param value - The value to check if it's a Promise.
 * @returns boolean - True if the value is a Promise, false otherwise.
 */
declare function isPromise(value: any): boolean;
/**
 * Checks if a value is a valid ActionStack action object.
 *
 * This function determines if the provided value is a valid action object
 * used in ActionStack for dispatching state changes.
 *
 * @param action - The value to check if it's a ActionStack action.
 * @returns boolean - True if the value is a plain object with a string property named "type", false otherwise.
 */
declare function isAction(action: any): action is Action<any>;
/**
 * Checks if a function is an async function.
 *
 * This function uses the constructor name to determine if the provided function
 * is an async function introduced in ES2018.
 *
 * @param func - The function to check if it's an async function.
 * @returns boolean - True if the function's constructor name is "AsyncFunction", false otherwise.
 */
declare function isAsync(func: Function): boolean;
/**
 * Checks if a value is a plain object.
 *
 * This function determines if the provided value is a plain object (an object
 * that doesn't inherit from other prototypes).
 *
 * @param obj - The value to check if it's a plain object.
 * @returns boolean - True if the value is an object and its prototype is the same as the Object.prototype, false otherwise.
 */
declare function isPlainObject(obj: any): boolean;
/**
 * Tests to see if the object is a streamix Stream
 * @param obj the object to test
 */
declare function isStream(obj: any): obj is Stream<unknown>;

/**
 * Creates a fresh, isolated action registry for a store instance.
 * Keeping registries per-store prevents collisions when multiple stores exist.
 */
declare function createActionRegistry(): ActionRegistry;
/**
 * Returns an array of all registered thunk creators.
 *
 * Thunks are asynchronous action creators that can be automatically
 * invoked by the middleware when their corresponding actions are dispatched.
 *
 * @returns {ThunkCreator<any, any, any>[]} Array of registered thunk creators.
 */
declare const getRegisteredThunks: (registry: ActionRegistry) => ThunkCreator<string, any, any, any[]>[];
/**
 * Retrieves the registered handler function for a specific action type.
 *
 * @param {string} type - The action type to look up.
 * @param {ActionRegistry} registry - The store's action registry.
 * @returns {Function | undefined} The handler function associated with the action type, or `undefined` if none is registered.
 */
declare const getActionHandlers: (type: string, registry: ActionRegistry) => ActionHandler<any, any> | undefined;
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
declare const registerActionHandlers: (module: FeatureModule, registry: ActionRegistry) => void;
/**
 * Unregisters all action handlers associated with a feature module.
 *
 * This function removes the module's action handlers from the registry,
 * effectively disabling those actions from being handled after the module is destroyed.
 *
 * @param module - The feature module whose action handlers should be removed.
 * @param registry - The store's action registry.
 */
declare const unregisterActionHandlers: (module: FeatureModule, registry: ActionRegistry) => void;
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
declare const registerThunks: (module: FeatureModule, registry: ActionRegistry) => void;
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
declare const unregisterThunks: (module: FeatureModule, registry: ActionRegistry) => void;
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
declare function createAction<TType extends string>(type: TType): ActionCreator<void, TType, []>;
declare function createAction<TType extends string, TState>(type: TType, handler: ActionHandler<TState, void>): ActionCreator<void, TType, []>;
declare function createAction<TType extends string, TPayload>(type: TType, handler: ActionHandler<any, TPayload>): ActionCreator<TPayload, TType, [TPayload]>;
declare function createAction<TType extends string, TArgs extends readonly any[], TPayload>(type: TType, handler: ActionHandler<any, TPayload>, payloadCreator: (...args: TArgs) => TPayload): ActionCreator<TPayload, TType, TArgs>;
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
declare function createThunk<TType extends string, TArgs extends readonly any[] = []>(type: TType, thunkBodyCreator: (...args: TArgs) => AsyncAction<any, any>, triggers?: ReadonlyArray<ThunkTrigger>): ThunkCreator<TType, any, any, TArgs>;
/**
 * Binds a single action creator to the dispatch function.
 *
 * @param actionCreator The action creator function.
 * @param dispatch The dispatch function.
 * @returns A function that dispatches the action created by the action creator.
 */
declare function bindActionCreator(actionCreator: Function, dispatch: Function): Function;
/**
 * Binds multiple action creators to the dispatch function.
 *
 * @param actionCreators An object of action creators or a single action creator function.
 * @param dispatch The dispatch function.
 * @returns An object of bound action creators or a single bound action creator function.
 */
declare function bindActionCreators(actionCreators: Record<string, Function> | Function, dispatch: Function): any;

/**
 * Generates a random string of a specified length in base-36 (including digits and lowercase letters).
 *
 * @param {number} length  - The desired length of the random string.
 * @returns {string}       - A random base-36 string of the provided length.
 */
declare function salt(length: number): string;
/**
 * Creates a simple 3-character hash of a string using a basic multiplication-based algorithm.
 *
 * @param {string} str - The string to be hashed.
 * @returns {string}   - A 3-character base-36 string representing the hash of the input string.
 */
declare function hash(str: string): string;
/**
 * Generates a self-checking token by combining a random salt and a 3-character hash of the salt, separated by dots.
 *
 * @returns {string} - A string containing the salt and its hash separated by dots (e.g., "abc.def").
 */
declare function generateToken(): string;
/**
 * Validates a provided token string based on its format and internal hash check.
 *
 * @param {string} token  - The token string to be validated.
 * @returns {boolean}     - True if the token is a valid format and the internal hash check passes, false otherwise.
 */
declare function isValidToken(token: string): boolean;

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
declare function waitForBrowserIdle(timeout?: number): Promise<void>;

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
declare function createModule<State, ActionTypes extends string, Actions extends Record<string, ActionCreator<ActionTypes> | ((...args: any[]) => any)>, Selectors extends Record<string, (state: State) => any>, Dependencies extends Record<string, any> = {}>(config: {
    slice: string;
    initialState: State;
    actions?: Actions;
    selectors?: Selectors;
    dependencies?: Dependencies;
}): FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>;
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
declare function registerModule<State, ActionTypes extends string, Actions extends Record<string, ActionCreator<ActionTypes> | ((...args: any[]) => any)>, Selectors extends Record<string, (state: State) => any>, Dependencies extends Record<string, any> = {}>(store: Store<any>, ...modules: FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>[]): FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>[];
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
declare function unregisterModule<State, ActionTypes extends string, Actions extends Record<string, any>, Selectors extends Record<string, any>, Dependencies extends Record<string, any>>(store: Store<any>, ...modulesOrClearState: Array<FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies> | boolean>): FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>[];
declare function populateStore<State, ActionTypes extends string, Actions extends Record<string, any>, Selectors extends Record<string, any>, Dependencies extends Record<string, any>>(store: Store<any>, ...modules: FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>[]): FeatureModule<State, ActionTypes, Actions, Selectors, Dependencies>[];

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
declare function createQueue(): {
    enqueue: <T = any>(operation: () => Promise<T> | T, options?: {
        inlineIfRunning?: boolean;
    }) => Promise<T>;
    readonly pending: number;
    readonly isEmpty: boolean;
};
/**
 * Type alias for the queue instance returned by {@link createQueue}.
 */
type ActionQueue = ReturnType<typeof createQueue>;

/**
 * A selector extracts a value from state.
 */
type Selector<T, R> = (state: T) => R;
/**
 * Helper types for inference
 */
type AnySelector = (state: any) => any;
type StateOf<F> = F extends (state: infer S) => any ? S : never;
type ResultOf<F> = F extends (state: any) => infer R ? R : never;
/**
 * Recursively resolves the type of a deeply nested property based on a path array.
 *
 * - []        -> T
 * - ['a']     -> T['a']
 * - ['a','b'] -> T['a']['b']
 */
type ValueAtPath<T, P extends readonly any[]> = P extends readonly [] ? T : P extends readonly [infer K, ...infer Rest] ? K extends keyof T ? ValueAtPath<T[K], Extract<Rest, readonly any[]>> : unknown : unknown;
/**
 * Variadic selector creator.
 *
 * Rules:
 * - selector(fn)                     → projection / identity
 * - selector(a, projector)           → derived
 * - selector(a, b, projector)        → derived
 *
 * The state type is inferred from the FIRST selector.
 */
declare function selector<S1 extends AnySelector, R>(s1: S1): Selector<StateOf<S1>, ResultOf<S1>>;
declare function selector<S1 extends AnySelector, R>(s1: S1, projector: (r1: ResultOf<S1>) => R): Selector<StateOf<S1>, R>;
declare function selector<S1 extends AnySelector, S2 extends AnySelector, R>(s1: S1, s2: S2, projector: (r1: ResultOf<S1>, r2: ResultOf<S2>) => R): Selector<StateOf<S1>, R>;
declare function selector<S1 extends AnySelector, S2 extends AnySelector, S3 extends AnySelector, R>(s1: S1, s2: S2, s3: S3, projector: (r1: ResultOf<S1>, r2: ResultOf<S2>, r3: ResultOf<S3>) => R): Selector<StateOf<S1>, R>;
declare function selector<S1 extends AnySelector, S2 extends AnySelector, S3 extends AnySelector, S4 extends AnySelector, R>(s1: S1, s2: S2, s3: S3, s4: S4, projector: (r1: ResultOf<S1>, r2: ResultOf<S2>, r3: ResultOf<S3>, r4: ResultOf<S4>) => R): Selector<StateOf<S1>, R>;
/**
 * Async variadic selector creator.
 *
 * Rules:
 * - selectorAsync(fn)                     → async projection
 * - selectorAsync(a, asyncProjector)      → async derived
 * - selectorAsync(a, b, asyncProjector)   → async derived
 *
 * Input selectors are synchronous.
 * Only the projector may be async.
 */
declare function selectorAsync<S1 extends AnySelector, R>(s1: S1): (state: StateOf<S1>) => Promise<ResultOf<S1>>;
declare function selectorAsync<S1 extends AnySelector, R>(s1: S1, projector: (r1: ResultOf<S1>) => Promise<R>): (state: StateOf<S1>) => Promise<R>;
declare function selectorAsync<S1 extends AnySelector, S2 extends AnySelector, R>(s1: S1, s2: S2, projector: (r1: ResultOf<S1>, r2: ResultOf<S2>) => Promise<R>): (state: StateOf<S1>) => Promise<R>;
declare function selectorAsync<S1 extends AnySelector, S2 extends AnySelector, S3 extends AnySelector, R>(s1: S1, s2: S2, s3: S3, projector: (r1: ResultOf<S1>, r2: ResultOf<S2>, r3: ResultOf<S3>) => Promise<R>): (state: StateOf<S1>) => Promise<R>;
declare function selectorAsync<S1 extends AnySelector, S2 extends AnySelector, S3 extends AnySelector, S4 extends AnySelector, R>(s1: S1, s2: S2, s3: S3, s4: S4, projector: (r1: ResultOf<S1>, r2: ResultOf<S2>, r3: ResultOf<S3>, r4: ResultOf<S4>) => Promise<R>): (state: StateOf<S1>) => Promise<R>;
/**
 * Creates a stream from a selector and a state stream.
 *
 * @param selector - A selector function used to derive a value from the state.
 * @param stateStream - The source stream of state values.
 */
declare function selectStream<T, R>(selector: Selector<T, R>, stateStream: Stream<T>): Stream<R>;
/**
 * Creates a stream from an async selector and a state stream.
 *
 * @param selector - An async selector function.
 * @param stateStream - The source stream of state values.
 */
declare function selectStreamAsync<T, R>(selector: (state: T) => Promise<R>, stateStream: Stream<T>): Stream<R>;

/**
 * @template TState - The overall type of your application's state.
 * @template {Record<string, any>} TDependencies - The type of the object containing application dependencies.
 *
 * Configuration object for the middleware pipeline.
 * This object provides the necessary context and utilities to each middleware function.
 * It's the `config` parameter received by middleware functions like `exclusive` and `concurrent`.
 */
interface MiddlewareConfig<TState = any, TDependencies extends Record<string, any> = Record<string, any>> {
    dispatch: (action: Action | AsyncAction) => Promise<void>;
    getState: () => TState;
    dependencies: () => TDependencies;
    queue: ActionQueue;
    registry: ActionRegistry;
}
/**
 * Functional handler for managing actions within middleware.
 *
 * @param {MiddlewareConfig} config - Configuration object for the middleware.
 * @returns {Function} - A function to handle actions.
 */
declare function createActionHandler(config: MiddlewareConfig, options?: {
    lockThunks?: boolean;
    afterAction?: (action: Action, next: Function, isNestedDispatch: boolean) => Promise<void>;
}): (action: Action | AsyncAction, next: Function, lockOrNested?: any, maybeNestedDispatch?: boolean) => Promise<void>;
/**
 * Function to create the starter middleware factory.
 * This factory function returns a middleware creator that takes strategy information as arguments and returns the actual middleware function.
 *
 * @returns Function - The middleware creator function.
 */
declare const createStarter: () => {
    ({ dispatch, getState, dependencies, strategy, queue, stack, registry }: any): (next: Function) => any;
    signature: string;
};
/**
 * Default starter middleware instance.
 */
declare const starter: {
    ({ dispatch, getState, dependencies, strategy, queue, stack, registry }: any): (next: Function) => any;
    signature: string;
};

/**
 * Class representing configuration options for a store.
 * This class defines properties that control various behaviors of a store for managing application state.
 */
type StoreSettings = {
    awaitStatePropagation?: boolean;
    dispatchSystemActions?: boolean;
    enableGlobalReducers?: boolean;
    exclusiveActionProcessing?: boolean;
};
/**
 * The `Store` type represents the core store object that manages state, actions, and modules.
 * It provides methods to interact with the store's state, dispatch actions, load/unload modules, and more.
 */
type Store<TState = any, TDependencies = any> = {
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
};
/**
 * Checks whether an action type belongs to the internal system namespace.
 *
 * @param type - Action type string to check.
 * @returns True when the type starts with "system/".
 */
declare function isSystemActionType(type: string): boolean;
/**
 * Creates a new store instance.
 *
 * This function initializes a store with the provided `mainModule` configuration and optional store enhancer.
 * It also accepts store settings that define various configuration options for the store.
 * The `storeSettings` parameter defaults to `defaultStoreSettings` if not provided.
 */
declare function createStore<T = any>(storeSettingsOrEnhancer?: StoreSettings | StoreEnhancer, enhancer?: StoreEnhancer): Store<T>;

type PropertyPath = readonly (string | number)[];
/**
 * Retrieves a property from an object based on a path.
 * @param obj - The object to retrieve the property from.
 * @param path - The path to the property (e.g., "key" or ["user", "name"]).
 * @returns The value of the property or `undefined` if the path is invalid.
 */
declare function getProperty<TObj>(obj: TObj, path: '*'): TObj;
declare function getProperty<TObj, K extends keyof NonNullable<TObj>>(obj: TObj, path: K): NonNullable<TObj>[K] | undefined;
declare function getProperty<TObj>(obj: TObj, path: '*' | PropertyPath): unknown;
/**
 * Sets a property in an object based on a path.
 * @param obj - The object to update.
 * @param path - The path to the property (e.g., "key" or ["user", "name"]).
 * @param value - The new value to set at the specified path.
 * @returns The updated object.
 */
declare function setProperty<TObj, TValue>(obj: TObj, path: '*', value: TValue): TValue;
declare function setProperty<TObj, TValue>(obj: TObj, path: readonly [], value: TValue): TValue;
declare function setProperty<TObj>(obj: TObj, path: string | PropertyPath, value: any): TObj;
/**
 * Combines multiple store enhancers into a single enhancer function.
 * This allows multiple enhancers to be applied in sequence to the store.
 * Typically used for combining middleware, logging, or other store customizations.
 *
 * @param enhancers - An array of store enhancers to be combined.
 * @returns A single store enhancer that applies all provided enhancers.
 */
declare function combineEnhancers(...enhancers: Array<StoreEnhancer | null | undefined | false>): StoreEnhancer;
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
declare function deepMerge(target: any, source: any): any;
/**
 * Combines reducers into a single reducer function.
 * Initializes the default state by invoking each reducer with `undefined` and a special `@@INIT` action.
 */
declare const combineReducers: (reducers: Tree<Reducer | AsyncReducer>) => AsyncReducer;
/**
 * Updates a nested state object by applying a change to the specified path and value.
 * Ensures that intermediate nodes in the state are properly cloned or created, preserving immutability
 * for unchanged branches. Tracks visited nodes in the provided object tree to avoid redundant updates.
 */
declare function applyChange(initialState: any, path: string[], value: any, objTree: Tree<boolean>): any;
/**
 * Applies middleware to the store's dispatch function.
 * Middleware enhances the dispatch function, allowing actions to be intercepted and modified.
 *
 * @param {...Function[]} middlewares Middleware functions to apply.
 * @returns A store enhancer that applies the middleware to the store.
 */
declare const applyMiddleware: (...middlewares: Function[]) => StoreEnhancer;

export { createAction as action, applyChange, applyMiddleware, bindActionCreator, bindActionCreators, combineEnhancers, combineReducers, createAction, createActionHandler, createActionRegistry, createModule, createQueue, createStarter, createStore, createThunk, deepMerge, generateToken, getActionHandlers, getProperty, getRegisteredThunks, hash, isAction, isAsync, isBoxed, isPlainObject, isPromise, isStream, isSystemActionType, isValidToken, kindOf, populateStore, registerActionHandlers, registerModule, registerThunks, salt, selectStream, selectStreamAsync, selector, selectorAsync, setProperty, starter, createThunk as thunk, unregisterActionHandlers, unregisterModule, unregisterThunks, waitForBrowserIdle };
export type { Action, ActionCreator, ActionHandler, ActionQueue, ActionRegistry, AnyFn, AnySelector, AsyncAction, AsyncObserver, AsyncReducer, CancelablePromise, Dispatch, FeatureModule, GetState, Middleware, MiddlewareAPI, MiddlewareConfig, Observer, OperatorFunction, ProcessingStrategy, ProjectionFunction, PropertyPath, Reducer, ResultOf, Selector, SelectorFunction, SliceStrategy, StateOf, Store, StoreCreator, StoreEnhancer, StoreSettings, Streams, ThunkAction, ThunkCreator, ThunkTrigger, Tree, ValueAtPath };
