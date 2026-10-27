import { action, applyMiddleware, combineReducers, createModule, createStore, thunk } from '@epikodelabs/actionstack';
import { MutationBatch } from '../lib/mutations';

describe('5.0.3 release regressions', () => {
  beforeEach(() => {
    spyOn(console, 'log').and.stub();
    spyOn(console, 'warn').and.stub();
    spyOn(console, 'error').and.stub();
  });

  for (const shape of ['object', 'nested map', 'map insertion', 'set insertion']) {
    it(`finalizes draft members after reading a fresh ${shape}`, async () => {
      const user = { n: 1 };
      const state: any = { user, map: new Map(), set: new Set() };
      const batch = new MutationBatch(state);
      await batch.run([], draft => {
        if (shape === 'object') {
          draft.result = { inner: { child: draft.user } };
          void draft.result.inner;
        } else if (shape === 'nested map') {
          draft.result = { inner: new Map([['child', draft.user]]) };
          void draft.result.inner;
        } else if (shape === 'map insertion') {
          draft.map.set('child', { child: draft.user });
          void draft.map.get('child');
        } else {
          draft.set.add({ child: draft.user });
          void [...draft.set][0];
        }
        delete draft.user;
      });
      batch.commit();
      const actual = shape === 'object' ? state.result.inner.child : shape === 'nested map'
        ? state.result.inner.get('child') : shape === 'map insertion'
          ? state.map.get('child').child : [...state.set][0].child;
      expect(actual).toBe(user);
      expect(actual.n).toBe(1);
    });
  }

  for (const read of [false, true]) {
    it(`rejects accessors without executing them (read=${read})`, async () => {
      const state: any = { n: 0 };
      const getter = jasmine.createSpy().and.callFake(() => { state.n = 99; return 1; });
      const payload = Object.defineProperty({}, 'x', { enumerable: true, get: getter });
      const batch = new MutationBatch(state);
      await expectAsync(batch.run([], draft => {
        draft.payload = payload;
        if (read) void draft.payload.x;
      })).toBeRejectedWithError(/accessors/);
      expect(getter).not.toHaveBeenCalled();
      expect(state.n).toBe(0);
      expect(Object.hasOwn(state, 'payload')).toBeFalse();
    });
  }

  it('prevents a delete/reinsert journal from partially committing to a non-extensible object', async () => {
    const state = { n: 0, object: Object.preventExtensions({ x: 1 }) };
    const batch = new MutationBatch(state);
    await batch.run([], draft => { draft.n++; delete draft.object.x; draft.object.x = 2; });
    expect(() => batch.commit()).toThrowError(/mutable/);
    expect(state.n).toBe(0);
    expect(state.object.x).toBe(1);
  });

  for (const exclusiveActionProcessing of [false, true]) {
    it(`preserves nested thunk results and non-Error failures (exclusive=${exclusiveActionProcessing})`, async () => {
      const store = createStore({ exclusiveActionProcessing });
      await store.dispatch({ type: 'FLUSH' });
      const answer: number = await store.dispatch(async dispatch => dispatch(async () => 42));
      expect(answer).toBe(42);
      for (const reason of [null, undefined, new Error('failure')]) {
        let resolved = false;
        let received: unknown = 'not rejected';
        await store.dispatch(async () => { throw reason; }).then(
          () => { resolved = true; }, error => { received = error; }
        );
        expect(resolved).toBeFalse();
        expect(received).toBe(reason);
      }
      expect(console.warn).toHaveBeenCalledTimes(3);
      await store.dispatch({ type: 'RECOVER' });
    });
  }

  it('holds the exclusive lock until triggered work and its child action finish', async () => {
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { entered = resolve; });
    const events: string[] = [];
    const store = createStore({ exclusiveActionProcessing: true });
    const module = createModule({ slice: 'locked', initialState: 0, actions: {
      start: action('START', (n: number) => n),
      child: action('CHILD', (n: number) => { events.push('child'); return n + 1; }),
      outside: action('OUTSIDE', (n: number) => { events.push('outside'); return n + 1; }),
      follow: thunk('FOLLOW', () => async dispatch => {
        events.push('trigger:start');
        await dispatch({ type: 'locked/CHILD' });
        entered();
        await gate;
        events.push('trigger:end');
      }, ['START']),
    } });
    await store.loadModule(module);
    const first = module.actions.start();
    await started;
    const outside = module.actions.outside();
    await Promise.resolve();
    expect(events).toEqual(['trigger:start', 'child']);
    release();
    await Promise.all([first, outside]);
    expect(events).toEqual(['trigger:start', 'child', 'trigger:end', 'outside']);
  });

  for (const method of ['loadModule', 'populate'] as const) {
    it(`rolls back ${method} completely and permits a repaired retry`, async () => {
      const store = createStore();
      await store.dispatch({ type: 'FLUSH' });
      const dependencies: Record<string, unknown> = {};
      Object.defineProperty(dependencies, 'service', { enumerable: true, configurable: true,
        get() { throw new Error('broken dependency'); } });
      const module = createModule({ slice: `repair-${method}`, initialState: { n: 0 }, dependencies,
        actions: { inc: action('INC', (s: { n: number }) => { s.n++; }) } });
      await expectAsync(store[method](module)).toBeRejectedWithError('broken dependency');
      expect(module.destroyed).toBeTrue();
      expect(store.middlewareAPI.registry.actionHandlers.has(`repair-${method}/INC`)).toBeFalse();
      expect(store.middlewareAPI.dependencies()).toEqual({});
      Object.defineProperty(dependencies, 'service', { value: 42, enumerable: true, configurable: true });
      await store[method](module);
      await module.actions.inc();
      expect(store.middlewareAPI.getState(`repair-${method}`)).toEqual({ n: 1 });
      expect(store.middlewareAPI.dependencies()).toEqual({ service: 42 });
    });
  }

  it('suppresses every observable system action and leaves their markers unset', async () => {
    const seen: string[] = [];
    const capture = () => (next: Function) => async (a: any) => { seen.push(a.type); return next(a); };
    const store = createStore({ dispatchSystemActions: false }, applyMiddleware(capture));
    const module = createModule({ slice: 'quiet', initialState: 0, actions: {} });
    await store.loadModule(module);
    await store.unloadModule(module);
    await store.dispatch({ type: 'FLUSH' });
    expect(seen.filter(type => type.startsWith('system/'))).toEqual([]);
    expect(store.middlewareAPI.getState('system')._ready).toBeFalse();
  });

  it('keeps literal dotted reducer keys distinct from nested paths', async () => {
    const reduce = combineReducers({ 'a.b': (n = 1) => n, a: { b: (n = 2) => n } });
    expect(await reduce(undefined, { type: '@@INIT' })).toEqual({ 'a.b': 1, a: { b: 2 } });
  });
});
