// utils.spec.ts - Jasmine Tests

import { applyMiddleware, combineEnhancers, combineReducers, deepMerge, getProperty, setProperty } from '@epikodelabs/actionstack';
import type { StoreCreator, StoreEnhancer } from '@epikodelabs/actionstack';
import { createBehaviorSubject } from '@epikodelabs/streamix';

describe('getProperty', () => {
  it('should retrieve top-level properties', () => {
    const obj = { a: 1, b: 2 };
    expect(getProperty(obj, 'a')).toBe(1);
    expect(getProperty(obj, 'b')).toBe(2);
  });

  it('should retrieve nested properties using array path', () => {
    const obj = { user: { profile: { name: 'Alice' } } };
    expect(getProperty(obj, ['user', 'profile', 'name'])).toBe('Alice');
  });

  it('should handle array indices in paths', () => {
    const obj = { items: [{ id: 1 }, { id: 2 }] };
    expect(getProperty(obj, ['items', '0', 'id'])).toBe(1);
    expect(getProperty(obj, ['items', 1, 'id'] as any)).toBe(2);
  });

  it('should return undefined for invalid paths', () => {
    const obj = { a: 1 };
    expect(getProperty(obj, ['nonexistent'])).toBeUndefined();
    expect(getProperty(obj, ['a', 'b', 'c'])).toBeUndefined();
    expect(getProperty(null as any, ['a'])).toBeUndefined();
  });

  it('should return entire object with * path', () => {
    const obj = { a: 1, b: 2 };
    expect(getProperty(obj, '*')).toBe(obj);
  });

  it('should handle null and undefined values gracefully', () => {
    expect(getProperty(null as any, 'a')).toBeUndefined();
    expect(getProperty(undefined as any, 'a')).toBeUndefined();
  });
});

describe('setProperty', () => {
  it('should return same reference when top-level value is unchanged', () => {
    const obj = { a: 1, b: 2 };
    const result = setProperty(obj, 'a', 1);
    expect(result).toBe(obj);
  });

  it('should create new object when top-level value changes', () => {
    const obj = { a: 1, b: 2 };
    const result = setProperty(obj, 'a', 3);
    expect(result).not.toBe(obj);
    expect(result).toEqual({ a: 3, b: 2 });
    expect(obj).toEqual({ a: 1, b: 2 }); // Original unchanged
  });

  it('should update nested properties with structural sharing', () => {
    const obj = {
      user: { name: 'Alice', age: 30 },
      settings: { theme: 'dark' }
    };

    const result = setProperty(obj, ['user', 'name'], 'Bob');
    
    // Top level changed
    expect(result).not.toBe(obj);
    
    // Changed branch is new
    expect(result.user).not.toBe(obj.user);
    
    // Unchanged branch is shared
    expect(result.settings).toBe(obj.settings);
    
    // Values are correct
    expect(result).toEqual({
      user: { name: 'Bob', age: 30 },
      settings: { theme: 'dark' }
    });
  });

  it('should handle array updates immutably', () => {
    const obj = { items: [1, 2, 3] };
    const result = setProperty(obj, ['items', '1'], 99);
    
    expect(result).not.toBe(obj);
    expect(result.items).not.toBe(obj.items);
    expect(result.items).toEqual([1, 99, 3]);
    expect(obj.items).toEqual([1, 2, 3]); // Original unchanged
  });

  it('should create intermediate objects for missing paths', () => {
    const obj = {};
    const result = setProperty(obj, ['a', 'b', 'c'], 123);
    expect(result).toEqual({ a: { b: { c: 123 } } });
  });

  it('should handle undefined values correctly', () => {
    const obj = { a: undefined };
    const result = setProperty(obj, 'a', undefined);
    expect(result).toBe(obj); // No change

    const obj2 = {};
    const result2 = setProperty(obj2, ['x'], undefined);
    expect(result2).toBe(obj2); // No change for undefined on missing path
  });

  it('should handle setting entire state with * path', () => {
    const obj = { a: 1 };
    const newState = { b: 2 };
    const result = setProperty(obj, '*', newState);
    expect(result).toBe(newState);
  });

  it('should handle empty path array', () => {
    const obj = { a: 1 };
    const result = setProperty(obj, [], { b: 2 });
    expect(result).toEqual({ b: 2 });
  });

  it('should preserve referential equality when setting same object', () => {
    const nested = { x: 1 };
    const obj = { a: nested };
    const result = setProperty(obj, 'a', nested);
    expect(result).toBe(obj);
  });
});

describe('deepMerge', () => {
  it('should merge objects deeply', () => {
    const a = { foo: { bar: 1 }, baz: 2 };
    const b = { foo: { qux: 3 }, baz: 4 };
    const result = deepMerge(a, b);
    expect(result).toEqual({ foo: { bar: 1, qux: 3 }, baz: 4 });
  });

  it('should replace arrays instead of merging', () => {
    const a = { items: [1, 2] };
    const b = { items: [3, 4] };
    const result = deepMerge(a, b);
    expect(result).toEqual({ items: [3, 4] });
  });

  it('should handle null values', () => {
    const a = { foo: { bar: 1 } };
    const b = { foo: null };
    const result = deepMerge(a, b);
    expect(result).toEqual({ foo: null });
  });

  it('should merge nested objects recursively', () => {
    const a = { 
      level1: { 
        level2: { 
          a: 1,
          b: 2
        }
      }
    };
    const b = { 
      level1: { 
        level2: { 
          c: 3
        }
      }
    };
    const result = deepMerge(a, b);
    expect(result).toEqual({
      level1: { 
        level2: { 
          a: 1,
          b: 2,
          c: 3
        }
      }
    });
  });

  it('should not mutate the original objects', () => {
    const a = { x: { y: 1 } };
    const b = { x: { z: 2 } };
    const originalA = { ...a };
    const originalB = { ...b };
    
    deepMerge(a, b);
    
    expect(a).toEqual(originalA);
    expect(b).toEqual(originalB);
  });

  it('should handle empty objects', () => {
    const a = {};
    const b = { x: 1 };
    const result = deepMerge(a, b);
    expect(result).toEqual({ x: 1 });
  });

  it('should handle undefined and null sources', () => {
    const a = { x: 1 };
    expect(deepMerge(a, undefined)).toEqual(a);
    expect(deepMerge(a, null)).toEqual(a);
  });
});

describe('combineReducers', () => {
  it('should combine synchronous reducers correctly', async () => {
    const counterReducer = (state = 0, action: any) => {
      switch (action.type) {
        case 'INCREMENT':
          return state + 1;
        case 'DECREMENT':
          return state - 1;
        default:
          return state;
      }
    };

    const todoReducer = (state: string[] = [], action: any) => {
      switch (action.type) {
        case 'ADD_TODO':
          return [...state, action.payload];
        default:
          return state;
      }
    };

    const rootReducer = combineReducers({
      counter: counterReducer,
      todos: {
        items: todoReducer
      }
    });

    // Test initial state
    const initialState = await rootReducer(undefined, { type: '@@INIT' });
    expect(initialState).toEqual({
      counter: 0,
      todos: { items: [] }
    });

    // Test action handling
    const state1 = await rootReducer(initialState, { type: 'INCREMENT' });
    expect(state1).toEqual({
      counter: 1,
      todos: { items: [] }
    });

    const state2 = await rootReducer(state1, { 
      type: 'ADD_TODO', 
      payload: 'Learn Redux' 
    });
    expect(state2).toEqual({
      counter: 1,
      todos: { items: ['Learn Redux'] }
    });
  });

  it('should combine asynchronous reducers correctly', async () => {
    const asyncReducer = async (state = 0, action: any) => {
      if (action.type === 'ASYNC_INCREMENT') {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 10));
        return state + 1;
      }
      return state;
    };

    const rootReducer = combineReducers({ asyncCounter: asyncReducer });
    
    const initialState = await rootReducer(undefined, { type: '@@INIT' });
    expect(initialState).toEqual({ asyncCounter: 0 });

    const nextState = await rootReducer(initialState, { type: 'ASYNC_INCREMENT' });
    expect(nextState).toEqual({ asyncCounter: 1 });
  });

  it('should maintain referential equality when no changes occur', async () => {
    const reducer = (state = { value: 0 }, action: any) => {
      if (action.type === 'NOOP') {
        return state; // Same reference
      }
      return state;
    };

    const rootReducer = combineReducers({ test: reducer });
    const initialState = await rootReducer(undefined, { type: '@@INIT' });
    
    const nextState = await rootReducer(initialState, { type: 'NOOP' });
    expect(nextState).toBe(initialState); // Same reference
  });

  it('should handle errors in reducers gracefully', async () => {
    const consoleSpy = spyOn(console, 'error').and.stub();
    
    const badReducer = (state = 0, action: any) => {
      if (action.type === 'THROW_ERROR') {
        throw new Error('Reducer error!');
      }
      return state;
    };

    const goodReducer = (state = 0, action: any) => {
      if (action.type === 'INCREMENT') {
        return state + 1;
      }
      return state;
    };

    const rootReducer = combineReducers({
      bad: badReducer,
      good: goodReducer
    });

    const state = { bad: 0, good: 0 };
    const nextState = await rootReducer(state, { type: 'THROW_ERROR' });
    
    // Should log error but not crash
    expect(consoleSpy).toHaveBeenCalled();
    expect(nextState).toBe(state); // State unchanged on error
  });

  it('should validate reducer structure on initialization', async () => {
    expect(() => {
      combineReducers({
        valid: (state = 0) => state,
        invalid: null as any
      });
    }).toThrowError(/Invalid reducer at path/);
  });
});

describe('applyMiddleware', () => {
  it('should apply middleware to dispatch', () => {
    const store = {
      getState: () => ({ counter: 0 }),
      dispatch: jasmine.createSpy('dispatch').and.callFake((action) => action),
      middlewareAPI: {
        getState: () => ({ counter: 0 }),
        dispatch: (action: any) => store.dispatch(action),
        queue: {
          enqueue: async (operation: () => Promise<void> | void) => operation(),
        },
      }
    } as any;

    const middleware1 = (api: any) => (next: any) => (action: any) => {
      return next({ ...action, modified: true });
    };

    const middleware2 = (api: any) => (next: any) => (action: any) => {
      return next(action);
    };

    const enhancer = applyMiddleware(middleware1, middleware2);
    const enhancedStore = enhancer(() => store)({});

    const action = { type: 'TEST' };
    enhancedStore.dispatch(action);

    expect(store.dispatch).toHaveBeenCalledWith({ type: 'TEST', modified: true });
  });

  it('should compose middleware in correct order', () => {
    const calls: string[] = [];
    
    const store = {
      getState: () => ({}),
      dispatch: (action: any) => {
        calls.push('store.dispatch');
        return action;
      },
      middlewareAPI: {
        getState: () => ({}),
        dispatch: (action: any) => store.dispatch(action),
        queue: {
          enqueue: async (operation: () => Promise<void> | void) => operation(),
        },
      }
    } as any;

    const middleware1 = (api: any) => (next: any) => {
      calls.push('middleware1 setup');
      return (action: any) => {
        calls.push('before middleware1');
        const result = next(action);
        calls.push('after middleware1');
        return result;
      };
    };

    const middleware2 = (api: any) => (next: any) => {
      calls.push('middleware2 setup');
      return (action: any) => {
        calls.push('before middleware2');
        const result = next(action);
        calls.push('after middleware2');
        return result;
      };
    };

    const enhancer = applyMiddleware(middleware1, middleware2);
    const enhancedStore = enhancer(() => store)({});

    enhancedStore.dispatch({ type: 'TEST' });

    // Check middleware setup order
    // Setup happens during composition (wrapping), so it's reverse of execution order.
    expect(calls.slice(0, 2)).toEqual(['middleware2 setup', 'middleware1 setup']);
    
    // Check execution order: middleware1 -> middleware2 -> store.dispatch
    expect(calls.slice(2)).toEqual([
      'before middleware1',
      'before middleware2',
      'store.dispatch',
      'after middleware2',
      'after middleware1'
    ]);
  });
});

describe('combineEnhancers', () => {
  it('should combine multiple enhancers', () => {
    const calls: string[] = [];
    
    const enhancer1: StoreEnhancer = (next) => {
      calls.push('enhancer1');
      return (settings) => {
        calls.push('enhancer1 execute');
        const store = next(settings);
        return {
          ...store,
          enhancedBy: 'enhancer1'
        };
      };
    };

    const enhancer2: StoreEnhancer = (next) => {
      calls.push('enhancer2');
      return (settings) => {
        calls.push('enhancer2 execute');
        const store = next(settings);
        return {
          ...store,
          enhancedBy: 'enhancer2'
        };
      };
    };

    const combined = combineEnhancers(enhancer1, enhancer2);
    
    // Create a mock store creator
    const mockStoreCreator: StoreCreator = (_settings, _enhancer) => {
      const middlewareAPI = {
        getState: (_slice?: string | string[]) => ({}),
        dispatch: async () => {},
        dependencies: () => ({}),
        strategy: () => ({} as any),
        queue: {
          enqueue: async (operation: () => Promise<void> | void) => operation(),
        },
      };

      return {
        dispatch: async () => {},
        getState: async (_slice, callback) => {
          await callback({} as any);
        },
        select: <R = any>(_selector: (state: any) => R | Promise<R>, defaultValue?: R) =>
          createBehaviorSubject(defaultValue as R),
        populate: async () => {},
        loadModule: async () => {},
        unloadModule: async () => {},
        addReducer: () => {},
        middlewareAPI: middlewareAPI as any,
        starter: (_api: any) => (next: any) => (action: any) => next(action),
      };
    };

    const enhancedCreator = combined(mockStoreCreator);
    const store = enhancedCreator({});

    // Setup order is inner-to-outer; execution order is outer-to-inner.
    expect(calls).toEqual([
      'enhancer1',
      'enhancer2',
      'enhancer2 execute',
      'enhancer1 execute',
    ]);
  });

  it('combines enhancers without metadata', () => {
    const enhancer1: StoreEnhancer = (next) => next;
    const enhancer2: StoreEnhancer = (next) => next;

    const combined = combineEnhancers(enhancer1, enhancer2);
    expect(typeof combined).toBe('function');
  });
});

describe('applyChange', () => {
  // Note: applyChange is not exported in your code, but we can test through combineReducers
  it('should apply changes immutably through combineReducers', async () => {
    const reducer = (state = { value: 0 }, action: any) => {
      if (action.type === 'UPDATE') {
        return { ...state, value: action.payload };
      }
      return state;
    };

    const rootReducer = combineReducers({ data: reducer });
    const initialState = await rootReducer(undefined, { type: '@@INIT' });
    
    const updatedState = await rootReducer(initialState, { 
      type: 'UPDATE', 
      payload: 42 
    });

    expect(updatedState).not.toBe(initialState);
    expect(updatedState.data).not.toBe(initialState.data);
    expect(updatedState).toEqual({ data: { value: 42 } });
  });
});

// Edge Cases and Integration Tests
describe('utils integration', () => {
  it('should work with complex nested state structures', async () => {
    const userReducer = (state = { name: '', age: 0 }, action: any) => {
      switch (action.type) {
        case 'SET_NAME':
          return { ...state, name: action.payload };
        case 'SET_AGE':
          return { ...state, age: action.payload };
        default:
          return state;
      }
    };

    const settingsReducer = (state = { theme: 'light' }, action: any) => {
      if (action.type === 'SET_THEME') {
        return { ...state, theme: action.payload };
      }
      return state;
    };

    const rootReducer = combineReducers({
      app: {
        user: userReducer,
        settings: settingsReducer
      },
      metadata: {
        version: (state = '1.0.0') => state
      }
    });

    const initialState = await rootReducer(undefined, { type: '@@INIT' });
    expect(initialState).toEqual({
      app: {
        user: { name: '', age: 0 },
        settings: { theme: 'light' }
      },
      metadata: { version: '1.0.0' }
    });

    // Update user name
    const state1 = await rootReducer(initialState, { 
      type: 'SET_NAME', 
      payload: 'John' 
    });
    expect(state1.app.user.name).toBe('John');
    expect(state1.app.settings).toBe(initialState.app.settings); // Unchanged branch shared
    expect(state1.metadata).toBe(initialState.metadata); // Unchanged branch shared

    // Update theme
    const state2 = await rootReducer(state1, { 
      type: 'SET_THEME', 
      payload: 'dark' 
    });
    expect(state2.app.settings.theme).toBe('dark');
    expect(state2.app.user).toBe(state1.app.user); // Unchanged branch shared
  });

  it('should handle concurrent async reducer calls', async () => {
    let callCount = 0;
    
    const asyncReducer = async (state = 0, action: any) => {
      callCount++;
      await new Promise(resolve => setTimeout(resolve, 10));
      return action.type === 'INCREMENT' ? state + 1 : state;
    };

    const rootReducer = combineReducers({ counter: asyncReducer });
    const initialState = await rootReducer(undefined, { type: '@@INIT' });
    callCount = 0;

    // Dispatch multiple actions concurrently
    const promises = [
      rootReducer(initialState, { type: 'INCREMENT' }),
      rootReducer(initialState, { type: 'INCREMENT' }),
      rootReducer(initialState, { type: 'INCREMENT' })
    ];

    const results = await Promise.all(promises);
    
    // Each call should be independent
    expect(callCount).toBe(3);
    expect(results[0]).toEqual({ counter: 1 });
    expect(results[1]).toEqual({ counter: 1 });
    expect(results[2]).toEqual({ counter: 1 });
  });
});

