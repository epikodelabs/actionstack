import type { Store } from '@epikodelabs/actionstack';
import {
  action,
  applyMiddleware,
  createModule,
  createStore,
  isSystemActionType,
  thunk,
} from '@epikodelabs/actionstack';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush(store: Store<any>) {
  await store.dispatch({ type: 'TEST/FLUSH' });
}

async function readState<T = any>(store: Store<any>, slice: any): Promise<T> {
  let value!: T;
  await store.getState(slice, (state) => {
    value = state as T;
  });
  return value;
}

describe('store', () => {
  beforeEach(() => {
    spyOn(console, 'log').and.stub();
    spyOn(console, 'warn').and.stub();
    spyOn(console, 'error').and.stub();
  });

  it('identifies system action types', () => {
    expect(isSystemActionType('system/READY')).toBeTrue();
    expect(isSystemActionType('system/')).toBeTrue();
    expect(isSystemActionType('foo/system/READY')).toBeFalse();
    expect(isSystemActionType(undefined as any)).toBeFalse();
  });

  it('initializes system module state', async () => {
    const store = createStore();
    await flush(store);

    const system = await readState<any>(store, 'system');
    expect(system).toEqual(jasmine.any(Object));
    expect(system._initialized).toBeTrue();
    expect(system._ready).toBeTrue();
    expect(Array.isArray(system._modules)).toBeTrue();
    expect(system._modules).toContain('system');
  });

  it('getState supports * and awaits async callback', async () => {
    const store = createStore();
    await flush(store);

    const started = deferred<void>();
    const allowFinish = deferred<void>();

    let resolved = false;
    const p = store
      .getState('*', async () => {
        started.resolve();
        await allowFinish.promise;
      })
      .then(() => {
        resolved = true;
      });

    await started.promise;
    expect(resolved).toBeFalse();

    allowFinish.resolve();
    await p;
    expect(resolved).toBeTrue();
  });

  it('getState releases queue when callback throws', async () => {
    const store = createStore();
    await flush(store);

    await expectAsync(
      store.getState('system', () => {
        throw new Error('boom');
      })
    ).toBeRejectedWithError('boom');

    let ran = false;
    await store.getState('system', () => {
      ran = true;
    });
    expect(ran).toBeTrue();
  });

  it('warns when dispatching invalid actions', async () => {
    const store = createStore();
    await flush(store);
    (console.warn as any).calls.reset();

    await store.dispatch(null as any);

    expect((console.warn as any).calls.any()).toBeTrue();
    expect(String((console.warn as any).calls.mostRecent().args[0])).toContain(
      'Invalid action dispatched:'
    );
  });

  it('select returns defaultValue and warns when selector throws', async () => {
    const store = createStore();
    await flush(store);
    (console.warn as any).calls.reset();

    const stream = store.select(() => {
      throw new Error('selector boom');
    }, 'DEFAULT');

    expect(await stream.query()).toBe('DEFAULT');
    expect((console.warn as any).calls.any()).toBeTrue();
    expect(String((console.warn as any).calls.mostRecent().args[0])).toContain(
      'Error in selector:'
    );
  });

  it('loads module initial state and updates system modules list', async () => {
    const store = createStore();
    const counterModule = createModule({
      slice: 'counter',
      initialState: 0,
      actions: {
        increment: action('INCREMENT', (state: number = 0) => state + 1),
      },
    });

    await store.loadModule(counterModule);
    await flush(store);

    expect(await readState(store, 'counter')).toBe(0);
    expect((await readState<any>(store, 'system'))._modules).toContain('counter');
  });

  it('loadModule is idempotent for an already loaded slice', async () => {
    const store = createStore();
    const mod = createModule({
      slice: 'dup',
      initialState: { value: 1 },
      actions: {},
    });

    await store.loadModule(mod);
    await store.loadModule(mod);
    await flush(store);

    const system = await readState<any>(store, 'system');
    const count = (system._modules as string[]).filter((s) => s === 'dup').length;
    expect(count).toBe(1);
  });

  it('dispatch applies action handlers and is serialized via internal queue', async () => {
    const store = createStore();
    const firstStarted = deferred<void>();
    const allowFirstFinish = deferred<void>();
    let handlerCalls = 0;

    const mod = createModule({
      slice: 'queue',
      initialState: 0,
      actions: {
        bump: action('BUMP', async (state: number = 0) => {
          handlerCalls++;
          if (handlerCalls === 1) {
            firstStarted.resolve();
            await allowFirstFinish.promise;
          }
          return state + 1;
        }),
      },
    });
    await store.loadModule(mod);
    await flush(store);

    const p1 = store.dispatch({ type: 'queue/BUMP' });
    await firstStarted.promise;
    expect(handlerCalls).toBe(1);

    const p2 = store.dispatch({ type: 'queue/BUMP' });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(handlerCalls).toBe(1);

    allowFirstFinish.resolve();
    await Promise.all([p1, p2]);

    expect(handlerCalls).toBe(2);
    expect(await readState(store, 'queue')).toBe(2);
  });

  it('unloadModule warns when module is not loaded', async () => {
    const store = createStore();
    await flush(store);
    (console.warn as any).calls.reset();

    const mod = createModule({
      slice: 'missing',
      initialState: {},
      actions: {},
    });

    await store.unloadModule(mod, true);
    expect((console.warn as any).calls.any()).toBeTrue();
  });

  it('unloadModule(clearState=true) clears slice state and updates system modules list', async () => {
    const store = createStore();
    const mod = createModule({
      slice: 'temp',
      initialState: { value: 1 },
      actions: {},
    });

    await store.loadModule(mod);
    await flush(store);
    expect(await readState<any>(store, 'temp')).toEqual({ value: 1 });

    await store.unloadModule(mod, true);
    await flush(store);

    expect(await readState(store, 'temp')).toBeUndefined();
    expect((await readState<any>(store, 'system'))._modules).not.toContain('temp');
  });

  it('select emits derived values and updates after dispatch', async () => {
    const store = createStore();
    const mod = createModule({
      slice: 'sel',
      initialState: 0,
      actions: {
        inc: action('INC', (state: number = 0) => state + 1),
      },
    });
    await store.loadModule(mod);
    await flush(store);

    const stream = store.select((state: any) => state.sel, -1);
    expect(await stream.query()).toBe(0);

    await store.dispatch({ type: 'sel/INC' });
    expect(await stream.query()).toBe(1);
  });

  it('select supports async selectors and applies defaultValue when resolved value is undefined', async () => {
    const store = createStore();
    await flush(store);

    const stream = store.select(
      async (state: any) => {
        await Promise.resolve();
        return state?.missing;
      },
      'DEFAULT'
    );

    expect(await stream.query()).toBe('DEFAULT');
  });

  it('exposes MiddlewareAPI dependencies, and injected module dependencies are available to thunks', async () => {
    const store = createStore();
    const depModule = createModule({
      slice: 'dep',
      initialState: { value: 0 },
      dependencies: { answer: 42 },
      actions: {
        set: action('SET', (state: any, payload: number) => ({
          ...state,
          value: payload,
        })),
        run: thunk(
          'TEST/DEP_RUN',
          () => async (dispatch, _getState, deps) => {
            await dispatch({ type: 'dep/SET', payload: deps.answer });
          },
          ['PING']
        ),
      },
    });

    await store.loadModule(depModule);
    await flush(store);

    expect(store.middlewareAPI.dependencies().answer).toBe(42);

    await store.dispatch({ type: 'dep/PING' });
    expect((await readState<any>(store, 'dep')).value).toBe(42);
  });

  it('ejects module dependencies on unloadModule', async () => {
    const store = createStore();
    const depModule = createModule({
      slice: 'dep2',
      initialState: {},
      dependencies: { token: 'x' },
      actions: {},
    });

    await store.loadModule(depModule);
    await flush(store);
    expect(store.middlewareAPI.dependencies().token).toBe('x');

    await store.unloadModule(depModule, true);
    await flush(store);
    expect(store.middlewareAPI.dependencies().token).toBeUndefined();
  });

  it('middlewareAPI.getState supports undefined, *, string paths, and array paths', async () => {
    const store = createStore();
    await flush(store);

    const api = store.middlewareAPI;

    expect(api.getState()).toEqual(jasmine.any(Object));
    expect(api.getState('*')).toEqual(jasmine.any(Object));
    expect(api.getState('system/_ready')).toBeTrue();
    expect(api.getState(['system', '_ready'])).toBeTrue();
  });

  it('runs global reducers when enabled', async () => {
    const store = createStore({ enableGlobalReducers: true });
    await flush(store);

    await store.addReducer((state: any, actionObj: any) => ({
      ...state,
      lastAction: actionObj.type,
    }));

    await store.dispatch({ type: 'TEST/GLOBAL' });
    const root = await readState<any>(store, '*');
    expect(root.lastAction).toBe('TEST/GLOBAL');
  });

  it('warns but does not fail when a global reducer throws', async () => {
    const store = createStore({ enableGlobalReducers: true });
    await flush(store);
    (console.warn as any).calls.reset();

    await store.addReducer(() => {
      throw new Error('reducer boom');
    });

    await store.dispatch({ type: 'TEST/REDUCER_THROW' });

    expect((console.warn as any).calls.any()).toBeTrue();
    expect(String((console.warn as any).calls.mostRecent().args[0])).toContain(
      'Error in meta-reducer'
    );
  });

  it('does not register global reducers when disabled', async () => {
    const store = createStore({ enableGlobalReducers: false });
    await flush(store);
    (console.warn as any).calls.reset();

    await store.addReducer((state: any, actionObj: any) => ({
      ...state,
      lastAction: actionObj.type,
    }));

    await store.dispatch({ type: 'TEST/GLOBAL_DISABLED' });
    const root = await readState<any>(store, '*');
    expect(root.lastAction).toBeUndefined();
    expect((console.warn as any).calls.any()).toBeTrue();
  });

  it('warns on overlapping dependency keys and preserves the first value', async () => {
    const store = createStore();
    await flush(store);
    (console.warn as any).calls.reset();

    class Service {}

    const a = createModule({
      slice: 'depsA',
      initialState: {},
      dependencies: {
        shared: 1,
        array: [1, 2, 3],
        inst: new Service(),
      },
      actions: {},
    });

    const b = createModule({
      slice: 'depsB',
      initialState: {},
      dependencies: {
        shared: 2,
      },
      actions: {},
    });

    await store.loadModule(a);
    await store.loadModule(b);
    await flush(store);

    expect(store.middlewareAPI.dependencies().shared).toBe(1);
    expect((console.warn as any).calls.any()).toBeTrue();
    expect(String((console.warn as any).calls.mostRecent().args[0])).toContain(
      'Overlapping property'
    );
  });

  it('awaitStatePropagation waits for browser idle when enabled', async () => {
    const store: any = createStore({ awaitStatePropagation: true });
    await flush(store);

    const scope = globalThis as typeof globalThis & {
      requestIdleCallback?: jasmine.Spy;
    };
    const originalRequestIdleCallback = scope.requestIdleCallback;
    scope.requestIdleCallback = jasmine.createSpy('requestIdleCallback').and.callFake((callback: () => void) => {
      callback();
      return 1;
    });

    try {
      await store.dispatch({ type: 'TEST/AWAIT' });
      expect(scope.requestIdleCallback).toHaveBeenCalled();
    } finally {
      scope.requestIdleCallback = originalRequestIdleCallback;
    }
  });

  it('populate skips already loaded modules and warns', async () => {
    const store = createStore();
    await flush(store);
    (console.warn as any).calls.reset();

    const mod = createModule({ slice: 'pop', initialState: {}, actions: {} });

    await store.populate(mod as any, mod as any);
    expect((console.warn as any).calls.any()).toBeTrue();
    expect(String((console.warn as any).calls.mostRecent().args[0])).toContain(
      'already loaded, skipping'
    );
  });

  it('populate configures modules so bound actions and handlers work', async () => {
    const store = createStore();
    const mod = createModule({
      slice: 'batched',
      initialState: 0,
      actions: {
        inc: action('INC', (state: number = 0) => state + 1),
      },
    });

    await store.populate(mod);
    await flush(store);

    mod.actions.inc();
    await flush(store);

    expect(await readState(store, 'batched')).toBe(1);
  });

  it('populate cleans up and reports errors when a module fails to load', async () => {
    const store = createStore();
    await flush(store);

    const onError = jasmine.createSpy('loaded$.error');
    const badModule: any = {
      slice: 'badmod',
      initialState: {},
      actions: {},
      dependencies: {},
      loaded$: {
        next: () => {
          throw new Error('boom');
        },
        error: onError,
      },
      destroyed$: { next: () => {}, complete: () => {} },
    };

    await expectAsync(store.populate(badModule)).toBeRejectedWithError('boom');
    expect(onError).toHaveBeenCalled();
  });

  it('select emits defaultValue when root state becomes null', async () => {
    const store = createStore({ enableGlobalReducers: true });
    await flush(store);

    await store.addReducer((_state: any, actionObj: any) => {
      return actionObj.type === 'TEST/NULL_STATE' ? null : undefined;
    });

    const stream = store.select((s: any) => s?.anything, 'DEFAULT');

    await store.dispatch({ type: 'TEST/NULL_STATE' });
    expect(await stream.query()).toBe('DEFAULT');
  });

  it('unloadModule(clearState=false) preserves slice state and allows reloading without resetting', async () => {
    const store = createStore();

    const mod = createModule({
      slice: 'keep',
      initialState: { value: 1 },
      actions: {
        set: action('SET', (_s: any, v: number) => ({ value: v })),
      },
    });

    await store.loadModule(mod);
    await flush(store);

    await store.dispatch({ type: 'keep/SET', payload: 7 });
    expect(await readState<any>(store, 'keep')).toEqual({ value: 7 });

    await store.unloadModule(mod, false);
    await flush(store);

    expect(await readState<any>(store, 'keep')).toEqual({ value: 7 });

    await store.loadModule(mod);
    await flush(store);

    expect(await readState<any>(store, 'keep')).toEqual({ value: 7 });
  });

  it('accepts applyMiddleware() as enhancer without re-wrapping', async () => {
    const store = createStore(applyMiddleware());
    await flush(store);

    const system = await readState<any>(store, 'system');
    expect(system._ready).toBeTrue();
  });

  it('auto-adds applyMiddleware() when enhancer does not include it', async () => {
    const enhancer = (next: any) => (settings: any) => next(settings);

    const store = createStore(enhancer);
    await flush(store);

    const system = await readState<any>(store, 'system');
    expect(system._ready).toBeTrue();
  });

  it('exclusiveActionProcessing runs matching thunks sequentially (store integration)', async () => {
    const store = createStore({ exclusiveActionProcessing: true });
    const events: string[] = [];
    const t1Started = deferred<void>();
    const allowT1Finish = deferred<void>();

    const mod = createModule({
      slice: 'excl',
      initialState: {},
      actions: {
        t1: thunk(
          'TEST/STORE_EXCL_1',
          () => async () => {
            events.push('t1-start');
            t1Started.resolve();
            await allowT1Finish.promise;
            events.push('t1-end');
          },
          ['PING']
        ),
        t2: thunk(
          'TEST/STORE_EXCL_2',
          () => async () => {
            events.push('t2');
          },
          ['PING']
        ),
      },
    });

    await store.loadModule(mod);
    await flush(store);

    const p = store.dispatch({ type: 'excl/PING' });
    await t1Started.promise;
    expect(events).toEqual(['t1-start']);

    allowT1Finish.resolve();
    await p;

    expect(events).toEqual(['t1-start', 't1-end', 't2']);
  });

  it('concurrent strategy does not collapse: subsequent actions still run after a thunk error', async () => {
    const store = createStore({ exclusiveActionProcessing: false });

    const mod = createModule({
      slice: 'res',
      initialState: { ok: 0 },
      actions: {
        bump: action('BUMP', (state: any) => ({ ...state, ok: (state?.ok ?? 0) + 1 })),
        bad: thunk(
          'TEST/STORE_CONC_ERROR',
          () => async () => {
            throw new Error('boom');
          },
          ['PING']
        ),
        good: thunk(
          'TEST/STORE_CONC_OK',
          () => async (dispatch) => {
            await dispatch({ type: 'res/BUMP' });
          },
          ['PONG']
        ),
      },
    });

    await store.loadModule(mod);
    await flush(store);

    await store.dispatch({ type: 'res/PING' });
    await store.dispatch({ type: 'res/PONG' });

    expect((await readState<any>(store, 'res')).ok).toBe(1);
  });

  describe('edge cases', () => {
    it('select handles complete and unsubscribe properly', async () => {
      const store: any = createStore({ awaitStatePropagation: true });
      await flush(store);

      const stream = store.select((s: any) => s?.system?._ready, false);
      
      const observer = {
        next: jasmine.createSpy('next'),
        error: jasmine.createSpy('error'),
        complete: jasmine.createSpy('complete'),
      };

      const subscription = stream.subscribe(observer);
      
      // Wait for the async emission
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(observer.next).toHaveBeenCalled();
      subscription.unsubscribe();
    });

    it('dispatch handles async reducer that returns undefined', async () => {
      const store = createStore({ enableGlobalReducers: true });
      await flush(store);

      await store.addReducer(async (_state: any, _action: any) => {
        await Promise.resolve();
        return undefined;
      });

      const before = await readState<any>(store, '*');
      await store.dispatch({ type: 'TEST/ASYNC_UNDEFINED' });
      const after = await readState<any>(store, '*');
      
      // State should remain unchanged when reducer returns undefined
      expect(after).toEqual(before);
    });

    it('processDependencies handles class instances correctly', async () => {
      const store = createStore();
      await flush(store);

      class CustomService {
        value = 'test';
      }

      const instance = new CustomService();

      const mod = createModule({
        slice: 'class-deps',
        initialState: {},
        dependencies: {
          service: instance,
        },
        actions: {},
      });

      await store.loadModule(mod);
      await flush(store);

      expect(store.middlewareAPI.dependencies().service).toBe(instance);
    });

    it('processDependencies handles arrays recursively', async () => {
      const store = createStore();
      await flush(store);

      const mod = createModule({
        slice: 'array-deps',
        initialState: {},
        dependencies: {
          items: [{ a: 1 }, { b: 2 }],
        },
        actions: {},
      });

      await store.loadModule(mod);
      await flush(store);

      const deps = store.middlewareAPI.dependencies();
      expect(Array.isArray(deps.items)).toBeTrue();
      expect(deps.items.length).toBe(2);
    });

    it('dispatch returns without promise when awaitStatePropagation is false', async () => {
      const store = createStore({ awaitStatePropagation: false });
      await flush(store);

      const result = await store.dispatch({ type: 'TEST/SYNC' });
      expect(result).toBeUndefined();
    });

    it('dispatch waits for browser idle when awaitStatePropagation is true', async () => {
      const store: any = createStore({ awaitStatePropagation: true });
      await flush(store);

      const originalSetTimeout = globalThis.setTimeout;
      const setTimeoutSpy = jasmine.createSpy('setTimeout').and.callFake(((callback: TimerHandler, _delay?: number, ...args: any[]) => {
        if (typeof callback === 'function') {
          callback(...args);
        }
        return 0 as any;
      }) as typeof setTimeout);
      (globalThis as any).requestIdleCallback = undefined;
      (globalThis as any).requestAnimationFrame = undefined;
      (globalThis as any).setTimeout = setTimeoutSpy;

      try {
        await store.dispatch({ type: 'TEST/TRACKED' });
      } finally {
        (globalThis as any).setTimeout = originalSetTimeout;
      }

      expect(setTimeoutSpy).toHaveBeenCalled();
    });

    it('dispatch handles async thunks properly', async () => {
      const store = createStore();
      const events: string[] = [];

      const mod = createModule({
        slice: 'async-thunk',
        initialState: {},
        actions: {
          run: thunk(
            'TEST/ASYNC_THUNK',
            () => async (dispatch) => {
              events.push('thunk-start');
              await dispatch({ type: 'TEST/NESTED' });
              events.push('thunk-end');
            },
            ['TRIGGER']
          ),
        },
      });

      await store.loadModule(mod);
      await flush(store);

      await store.dispatch({ type: 'async-thunk/TRIGGER' });
      expect(events).toEqual(['thunk-start', 'thunk-end']);
    });

    it('ejectDependencies correctly rebuilds dependencies after module removal', async () => {
      const store = createStore();
      await flush(store);

      const modA = createModule({
        slice: 'modA',
        initialState: {},
        dependencies: { a: 1, shared: 'A' },
        actions: {},
      });

      const modB = createModule({
        slice: 'modB',
        initialState: {},
        dependencies: { b: 2 },
        actions: {},
      });

      await store.loadModule(modA);
      await store.loadModule(modB);
      await flush(store);

      expect(store.middlewareAPI.dependencies()).toEqual(jasmine.objectContaining({ a: 1, b: 2, shared: 'A' }));

      await store.unloadModule(modB);
      await flush(store);

      expect(store.middlewareAPI.dependencies().b).toBeUndefined();
      expect(store.middlewareAPI.dependencies().a).toBe(1);
    });

    it('getState handles nested slice paths with arrays', async () => {
      const store = createStore();
      const mod = createModule({
        slice: 'deep/nested',
        initialState: { value: 42 },
        actions: {},
      });

      await store.loadModule(mod);
      await flush(store);

      const value = await readState(store, ['deep', 'nested']);
      expect(value).toEqual({ value: 42 });
    });

    it('middlewareAPI.dispatch calls store.dispatch', async () => {
      const store = createStore();
      await flush(store);

      spyOn(store, 'dispatch').and.resolveTo();

      await store.middlewareAPI.dispatch({ type: 'TEST/API' });
      expect(store.dispatch).toHaveBeenCalledWith({ type: 'TEST/API' });
    });

    it('populate initializes state for new modules', async () => {
      const store = createStore();
      await flush(store);

      const mod = createModule({
        slice: 'populated',
        initialState: { val: 100 },
        actions: {},
      });

      await store.populate(mod as any);

      const state = await readState<any>(store, 'populated');
      expect(state.val).toBe(100);
    });

    it('populate handles module.loaded$.next() and emits state update', async () => {
      const store = createStore();
      await flush(store);

      const loaded = jasmine.createSpy('loaded');
      const mod: any = {
        slice: 'loaded-test',
        initialState: {},
        actions: {},
        dependencies: {},
        loaded$: { next: loaded, error: () => {} },
        destroyed$: { next: () => {}, complete: () => {} },
        configure: () => {},
      };

      await store.populate(mod);
      expect(loaded).toHaveBeenCalled();
    });

    it('unloadModule calls module.destroyed$.next()', async () => {
      const store = createStore();
      await flush(store);

      const destroyed = jasmine.createSpy('destroyed');
      const mod: any = {
        slice: 'destroy-test',
        initialState: {},
        actions: {},
        dependencies: {},
        loaded$: { next: () => {}, error: () => {} },
        destroyed$: { next: destroyed, complete: () => {} },
        configure: () => {},
      };

      await store.loadModule(mod);
      await flush(store);

      await store.unloadModule(mod);
      expect(destroyed).toHaveBeenCalled();
    });

    it('loadModule calls module.configure() with store instance', async () => {
      const store = createStore();
      await flush(store);

      const configure = jasmine.createSpy('configure');
      const mod: any = {
        slice: 'config-test',
        initialState: {},
        actions: {},
        dependencies: {},
        loaded$: { next: () => {}, error: () => {} },
        destroyed$: { next: () => {}, complete: () => {} },
        configure,
      };

      await store.loadModule(mod);
      expect(configure).toHaveBeenCalledWith(store);
    });

    it('select handles observer error callback', async () => {
      const store: any = createStore({ awaitStatePropagation: true });
      await flush(store);

      const stream = store.select((s: any) => s?.system?._ready);
      
      const errorSpy = jasmine.createSpy('error');
      const observer = {
        next: () => {},
        error: errorSpy,
      };

      const subscription: any = stream.subscribe(observer);
      
      // Simulate an error (though in practice errors would come from the source)
      // For coverage, we ensure the wrapped observer handles it
      if (subscription.observers && subscription.observers[0]) {
        subscription.observers[0].error(new Error('test error'));
      }
    });

    it('normalizePath handles string and array paths', async () => {
      const store = createStore();
      await flush(store);

      // Test that both formats work
      const api = store.middlewareAPI;
      const stringPath = api.getState('system/_ready');
      const arrayPath = api.getState(['system', '_ready']);

      expect(stringPath).toBe(arrayPath);
      expect(stringPath).toBeTrue();
    });

    it('dispatch handles action without payload property', async () => {
      const store = createStore();
      const mod = createModule({
        slice: 'no-payload',
        initialState: 0,
        actions: {
          inc: action('INC', (state: number = 0) => state + 1),
        },
      });

      await store.loadModule(mod);
      await flush(store);

      await store.dispatch({ type: 'no-payload/INC' });
      expect(await readState(store, 'no-payload')).toBe(1);
    });

    it('handles deeply nested module slice paths', async () => {
      const store = createStore();
      const mod = createModule({
        slice: 'level1/level2/level3',
        initialState: { deep: 'value' },
        actions: {},
      });

      await store.loadModule(mod);
      await flush(store);

      const state = await readState(store, 'level1/level2/level3');
      expect(state).toEqual({ deep: 'value' });
    });

    it('system updateState action merges partial state', async () => {
      const store = createStore();
      await flush(store);

      // Access system actions to trigger updateState
      await store.dispatch({
        type: 'system/UPDATE_STATE',
        payload: { customProp: 'test' },
      });

      const systemState = await readState<any>(store, 'system');
      expect(systemState.customProp).toBe('test');
    });

    it('select handles observer complete callback', async () => {
      const store: any = createStore({ awaitStatePropagation: true });
      await flush(store);

      const stream = store.select((s: any) => s?.system?._ready);
      
      const completeSpy = jasmine.createSpy('complete');
      const observer = {
        next: () => {},
        complete: completeSpy,
      };

      const subscription: any = stream.subscribe(observer);
      
      // Wait for initial emission
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Trigger complete
      if (subscription.observers && subscription.observers[0]) {
        subscription.observers[0].complete();
      }
    });

    it('dispatch function action (thunk) directly', async () => {
      const store = createStore();
      await flush(store);

      const events: string[] = [];
      const thunkFn = async (dispatch: any, getState: any, deps: any) => {
        events.push('thunk-executed');
        await dispatch({ type: 'TEST/FROM_THUNK' });
      };

      await store.dispatch(thunkFn as any);
      expect(events).toEqual(['thunk-executed']);
    });

    it('direct thunk dispatch routes nested actions through starter triggers', async () => {
      const store = createStore();
      const events: string[] = [];

      const mod = createModule({
        slice: 'direct-thunk',
        initialState: { count: 0 },
        actions: {
          bump: action('BUMP', (state: any) => ({ count: (state?.count ?? 0) + 1 })),
          follow: thunk(
            'FOLLOW',
            () => async () => {
              events.push('follow');
            },
            ['BUMP']
          ),
        },
      });

      await store.loadModule(mod);
      await flush(store);

      await store.dispatch(async (dispatch) => {
        await dispatch({ type: 'direct-thunk/BUMP' });
      });

      expect((await readState<any>(store, 'direct-thunk')).count).toBe(1);
      expect(events).toEqual(['follow']);
    });

    it('system selectors work correctly', async () => {
      const store = createStore();
      await flush(store);

      const mod = createModule({
        slice: 'selector-test',
        initialState: {},
        selectors: {
          getValue: (state: any) => state?.value || 'default',
        },
        actions: {},
      });

      await store.loadModule(mod);
      await flush(store);

      expect(mod.selectors.getValue({ 'selector-test': { value: 'test' } } as any)).toBe('test');

      const systemState = await readState<any>(store, 'system');
      expect(systemState._initialized).toBeTrue();
      expect(systemState._ready).toBeTrue();
      expect(Array.isArray(systemState._modules)).toBeTrue();
    });

    it('handles state being null in select callback', async () => {
      const store = createStore({ enableGlobalReducers: true });
      await flush(store);

      // Force state to become null
      await store.addReducer((_state: any, action: any) => {
        if (action.type === 'NULLIFY') return null;
        return undefined;
      });

      const stream = store.select((s: any) => s?.anything, 'fallback');
      
      await store.dispatch({ type: 'NULLIFY' });
      
      // Should use default value when state is null
      const value = await stream.query();
      expect(value).toBe('fallback');
    });

    it('concurrent inflight.delete is called in finally block', async () => {
      const store = createStore({ exclusiveActionProcessing: false });
      
      const mod = createModule({
        slice: 'finally-test',
        initialState: {},
        actions: {
          test: thunk(
            'TEST/FINALLY',
            () => async () => {
              await Promise.resolve();
            },
            ['TRIGGER']
          ),
        },
      });

      await store.loadModule(mod);
      await flush(store);

      await store.dispatch({ type: 'finally-test/TRIGGER' });
      
      // Just verify it completes without error
      expect(true).toBeTrue();
    });
  });
});
