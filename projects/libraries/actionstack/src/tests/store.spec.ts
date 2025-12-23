import type { Store } from '@actioncrew/actionstack';
import {
  action,
  applyMiddleware,
  createModule,
  createStore,
  thunk,
} from '@actioncrew/actionstack';
import { withTracker } from '@actioncrew/actionstack/tracking';

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

  it('awaitStatePropagation waits on tracker when enabled', async () => {
    const enhancer = withTracker();
    spyOn(enhancer.tracker, 'waitAll').and.resolveTo();

    const store: any = createStore({ awaitStatePropagation: true }, enhancer as any);
    await flush(store);

    await store.dispatch({ type: 'TEST/AWAIT' });
    expect(enhancer.tracker.waitAll).toHaveBeenCalled();
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
});
