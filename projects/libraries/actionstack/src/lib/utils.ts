import type { Action, AsyncReducer, Reducer, StoreCreator, StoreEnhancer, Tree } from "./types";

export type PropertyPath = readonly (string | number)[];

/**
 * Retrieves a property from an object based on a path.
 * @param obj - The object to retrieve the property from.
 * @param path - The path to the property (e.g., "key" or ["user", "name"]).
 * @returns The value of the property or `undefined` if the path is invalid.
 */
export function getProperty<TObj>(obj: TObj, path: '*'): TObj;
export function getProperty<TObj, K extends keyof NonNullable<TObj>>(
  obj: TObj,
  path: K
): NonNullable<TObj>[K] | undefined;
export function getProperty<TObj>(obj: TObj, path: '*' | PropertyPath): unknown;
export function getProperty(obj: any, path: any): any {
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

    let current: any = obj;
    for (const rawKey of path as any[]) {
      if (current === undefined || current === null) return undefined;
      const key =
        typeof rawKey === 'number'
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

/**
 * Sets a property in an object based on a path.
 * @param obj - The object to update.
 * @param path - The path to the property (e.g., "key" or ["user", "name"]).
 * @param value - The new value to set at the specified path.
 * @returns The updated object.
 */
export function setProperty<TObj, TValue>(
  obj: TObj,
  path: '*',
  value: TValue
): TValue;
export function setProperty<TObj, TValue>(
  obj: TObj,
  path: readonly [],
  value: TValue
): TValue;
export function setProperty<TObj>(
  obj: TObj,
  path: string | PropertyPath,
  value: any
): TObj;
export function setProperty(obj: any, path: any, value: any): any {
  // Handle global state update
  if (path === '*') {
    return value;
  }

  const isIndexKey = (key: unknown): boolean =>
    (typeof key === 'number' && Number.isInteger(key) && key >= 0) ||
    (typeof key === 'string' && /^[0-9]+$/.test(key));

  const normalizeKey = (key: unknown): string | number => {
    if (typeof key === 'number') return key;
    if (typeof key === 'string' && isIndexKey(key)) return Number(key);
    return String(key);
  };

  const ensureContainerForNextKey = (nextKey: unknown) =>
    isIndexKey(nextKey) ? [] : {};

  const readCurrent = (root: any, keys: Array<string | number>): any => {
    let current = root;
    for (const key of keys) {
      if (current === undefined || current === null) return undefined;
      current = current[key as any];
    }
    return current;
  };

  const writePath = (
    root: any,
    keys: Array<string | number>,
    leafValue: any
  ): any => {
    const createClone = (node: any, nextKey: unknown) => {
      if (Array.isArray(node)) return node.slice();
      if (node && typeof node === 'object') return { ...node };
      return ensureContainerForNextKey(nextKey);
    };

    const newRoot = createClone(root, keys[0]);
    let cursor = newRoot;
    let sourceCursor = root;

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];

      if (i === keys.length - 1) {
        cursor[key as any] = leafValue;
        break;
      }

      const nextKey = keys[i + 1];
      const existingNext = sourceCursor?.[key as any];
      const nextNode =
        existingNext && typeof existingNext === 'object'
          ? createClone(existingNext, nextKey)
          : ensureContainerForNextKey(nextKey);

      cursor[key as any] = nextNode;
      cursor = nextNode;
      sourceCursor = existingNext;
    }

    return newRoot;
  };

  // Handle string path (single key)
  if (typeof path === 'string') {
    const currentValue = obj?.[path];
    if (currentValue === value) return obj;
    if (currentValue === undefined && value === undefined) return obj;
    if (obj === undefined || obj === null || typeof obj !== 'object') {
      return { [path]: value };
    }
    return { ...obj, [path]: value };
  }

  // Handle array path (nested keys)
  if (Array.isArray(path)) {
    if (path.length === 0) return value;

    const keys = (path as any[]).map(normalizeKey);
    const currentValue = readCurrent(obj, keys);

    if (currentValue === value) return obj;
    if (currentValue === undefined && value === undefined) return obj;

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
function combineEnhancers(...enhancers: Array<StoreEnhancer | null | undefined | false>): StoreEnhancer {
  const active = enhancers.filter(Boolean) as StoreEnhancer[];

  // Identity enhancer for convenience.
  if (active.length === 0) {
    return (next) => next;
  }

  const combinedEnhancer: StoreEnhancer = (next: StoreCreator) =>
    active.reduce((acc, enhancer) => enhancer(acc), next);

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
export function deepMerge(target: any, source: any): any {
  if (source === undefined || source === null) return target;
  if (target === undefined || target === null) return source;

  const output = { ...target };
  for (const key of Object.keys(source)) {
    if (
      typeof source[key] === 'object' &&
      source[key] !== null &&
      !Array.isArray(source[key])
    ) {
      output[key] = deepMerge(output[key] ?? {}, source[key]);
    } else {
      output[key] = source[key];
    }
  }
  return output;
}

/**
 * Combines reducers into a single reducer function.
 * Initializes the default state by invoking each reducer with `undefined` and a special `@@INIT` action.
 */
const combineReducers = (reducers: Tree<Reducer | AsyncReducer>): AsyncReducer => {
  /**
   * Helper to validate reducers and flatten them into a single map.
   *
   * This recursively flattens the nested reducer tree and ensures all reducer paths are captured in the map.
   */
  const flattenReducers = (tree: Tree<Reducer | AsyncReducer>, path: string[] = []): Map<string, { reducer: AsyncReducer; path: string[] }> => {
    const reducerMap = new Map<string, { reducer: AsyncReducer; path: string[] }>();

    for (const key in tree) {
      const reducer = tree[key];
      const currentPath = [...path, key];

      if (typeof reducer === "function") {
        reducerMap.set(currentPath.join("."), { reducer, path: currentPath });
      } else if (typeof reducer === "object" && reducer !== null) {
        // Recursively flatten the nested reducers.
        const childReducers = flattenReducers(reducer, currentPath);
        childReducers.forEach((childReducer, childKey) => {
          reducerMap.set(childKey, childReducer);
        });
      } else {
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
  const gatherInitialState = async (): Promise<any> => {
    const initialState: any = {};

    for (const { reducer, path } of reducerMap.values()) {
      const key = path[path.length - 1]; // Get the last key in the path as the state slice
      try {
        const initState = await reducer(undefined, { type: "@@INIT" } as Action);
        let cursor = initialState;
        for (let i = 0; i < path.length - 1; i++) {
          cursor[path[i]] = cursor[path[i]] || {};
          cursor = cursor[path[i]];
        }
        cursor[key] = initState;
      } catch (error: any) {
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
  return async (state: any, action: Action): Promise<any> => {
    if (state === undefined) {
      state = await gatherInitialState();
      if (action?.type === '@@INIT') return state;
    }

    let hasChanged = false;
    const modified: any = {}; // To track the modifications

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
      } catch (error: any) {
        console.error(
          `Error processing reducer at "${path.join(".")}" with action "${action.type}": ${error.message}`
        );
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
function applyChange(initialState: any, path: string[], value: any, objTree: Tree<boolean>): any {
  let currentState: any = Object.keys(objTree).length > 0 ? initialState: {...initialState};
  let currentObj: any = currentState;

  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    if (i === path.length - 1) {
      // Reached the leaf node, update its value
      currentObj[key] = value;
      objTree[key] = true;
    } else {
      // Continue traversal
      currentObj = currentObj[key] = objTree[key] ? currentObj[key] : { ...currentObj[key] };
      objTree = (objTree[key] = objTree[key] ?? {}) as any;
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
const applyMiddleware = (...middlewares: Function[]): StoreEnhancer => {
  const enhancer: StoreEnhancer = (next) => (settings, enhancer) => {
    // Create the store with the original reducer and enhancer
    const store = next(settings, enhancer);

    // Define middleware API
    const middlewareAPI = store.middlewareAPI;

    // Build middleware chain
    const chain: Array<(next: any) => any> = [];
    for (let i = 0; i < middlewares.length; i++) {
      chain.push(middlewares[i](middlewareAPI));
    }

    // Compose the middleware chain into a single dispatch function
    const dispatch = chain.reduceRight(
      (next, middleware) => middleware(next),
      store.dispatch
    ) as typeof store.dispatch;

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

export {
  applyChange,
  applyMiddleware,
  combineEnhancers,
  combineReducers
};

