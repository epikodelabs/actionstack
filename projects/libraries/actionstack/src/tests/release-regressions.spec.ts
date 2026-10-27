import { action, applyMiddleware, combineReducers, createModule, createStore, thunk } from '@epikodelabs/actionstack';
import type { Action, ActionCreator, Dispatch } from '@epikodelabs/actionstack';
import { createCurrentSource, type CurrentValue } from '../lib/current-source';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};

// Compile-only contracts: declarations must match the runtime promise values.
function publicTypes(dispatch: Dispatch) {
  const module = createModule({
    slice: 'typed', initialState: 0,
    actions: { inc: action('INC', (state: number) => state + 1), answer: thunk('ANSWER', (n: number) => async () => n) },
  });
  const result: Promise<number> = module.actions.answer(42);
  // @ts-expect-error Thunk results cannot be treated as an unrelated type.
  const incorrectResult: Promise<string> = module.actions.answer(42);
  const plain: Promise<void> = module.actions.inc();
  // @ts-expect-error Bound methods no longer return action objects.
  const incorrectAction: Action = module.actions.inc();
  // @ts-expect-error A bound method cannot be reused as a pure creator.
  const incorrectCreator: ActionCreator = module.actions.inc;
  const type: string = module.actions.inc.type;
  const nested: Promise<number> = dispatch(async child => child(async () => 42));
  void [result, incorrectResult, plain, incorrectAction, incorrectCreator, type, nested];
}
void publicTypes;

describe('release regressions', () => {
  beforeEach(() => {
    spyOn(console, 'log').and.stub();
    spyOn(console, 'warn').and.stub();
  });

  it('delivers equal pending values only to subscribers waiting for their initial value', async () => {
    let emit!: (value: CurrentValue<number>) => void;
    const source = createCurrentSource<number>({ connect: next => { emit = next; next(1); } });
    const first: number[] = [];
    const second: number[] = [];
    const a = source.subscribe(value => first.push(value));
    const gate = deferred<number>();
    emit(gate.promise);
    const b = source.subscribe(value => second.push(value));
    expect(second).toEqual([]);
    gate.resolve(1);
    await gate.promise; await Promise.resolve();
    expect(first).toEqual([1]);
    expect(second).toEqual([1]);
    await a(); await b();
  });

  it('removes an initial-value waiter synchronously when it unsubscribes', async () => {
    let emit!: (value: CurrentValue<number>) => void;
    const source = createCurrentSource<number>({ connect: next => { emit = next; next(1); } });
    const values: number[] = [];
    const a = source.subscribe(value => values.push(value));
    const gate = deferred<number>();
    emit(gate.promise);
    const removed: number[] = [];
    const b = source.subscribe(value => removed.push(value));
    const removing = b();
    gate.resolve(1);
    await gate.promise; await removing; await Promise.resolve();
    expect(values).toEqual([1]);
    expect(removed).toEqual([]);
    await a();
  });

  it('reconnects equal async selections and makes settled values available to later subscribers', async () => {
    const store = createStore();
    const module = createModule({
      slice: 'async-reconnect', initialState: { n: 1 },
      selectors: { n: async (state: { n: number }) => state.n }, actions: {},
    });
    await store.loadModule(module);
    await store.dispatch({ type: 'FLUSH' });
    const source = module.data$.n();
    const first: number[] = [];
    const a = source.subscribe(value => first.push(value));
    await new Promise(resolve => setTimeout(resolve, 0));
    await a();
    const second: number[] = [];
    const b = source.subscribe(value => second.push(value));
    await new Promise(resolve => setTimeout(resolve, 0));
    const third: number[] = [];
    const c = source.subscribe(value => third.push(value));
    expect(first).toEqual([1]);
    expect(second).toEqual([1]);
    expect(third).toEqual([1]);
    await b(); await c();
  });

  it('confirms a module selection to a joining subscriber even when its pending result is equal', async () => {
    const store = createStore();
    let gate: Promise<void> | undefined;
    const module = createModule({
      slice: 'pending-join', initialState: { n: 1, other: 0 },
      actions: { bump: action('BUMP', (state: { n: number; other: number }) => ({ ...state, other: state.other + 1 })) },
      selectors: { n: async (state: { n: number; other: number }) => { if (gate) await gate; return state.n; } },
    });
    await store.loadModule(module); await store.dispatch({ type: 'FLUSH' });
    const values: number[] = [];
    const source = module.data$.n();
    const a = source.subscribe(value => values.push(value));
    await new Promise(resolve => setTimeout(resolve, 0));
    const pending = deferred<void>(); gate = pending.promise;
    await module.actions.bump();
    const joined: number[] = [];
    const b = source.subscribe(value => joined.push(value));
    expect(joined).toEqual([]);
    pending.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(values).toEqual([1]);
    expect(joined).toEqual([1]);
    await a(); await b();
  });

  for (const method of ['loadModule', 'populate'] as const) {
    it(`rolls back ${method} registration and dependencies, then permits a fresh retry`, async () => {
      const store = createStore();
      await store.dispatch({ type: 'FLUSH' });
      const dependencies = { dependency: 42 };
      const module = createModule({
        slice: 'failed', initialState: { n: 1 }, dependencies,
        actions: { inc: action('INC', (state: { n: number }) => ({ n: state.n + 1 })) },
        selectors: { n: (state: { n: number }) => state.n },
      });
      Object.defineProperty(dependencies, 'broken', { configurable: true, enumerable: true, get: () => { throw new Error('broken dependency'); } });
      await expectAsync(store[method](module)).toBeRejectedWithError('broken dependency');
      expect(store.middlewareAPI.registry.actionHandlers.has('failed/INC')).toBeFalse();
      expect(store.middlewareAPI.dependencies()).toEqual({});
      expect(module.destroyed).toBeTrue();
      await expectAsync(module.actions.inc()).toBeRejected();
      delete (dependencies as any).broken;
      await store[method](module);
      await module.actions.inc();
      expect(store.middlewareAPI.getState('failed')).toEqual({ n: 2 });
      const values: number[] = [];
      const sub = module.data$.n().subscribe(value => values.push(value));
      expect(values).toEqual([2]);
      await sub();
    });
  }

  it('disables every observable system action and leaves markers unset', async () => {
    const observed: string[] = [];
    const trace = () => (next: Function) => (event: Action) => { observed.push(event.type); return next(event); };
    const store = createStore({ dispatchSystemActions: false }, applyMiddleware(trace));
    const module = createModule({ slice: 'quiet', initialState: 0, actions: {} });
    await store.loadModule(module); await store.unloadModule(module); await store.dispatch({ type: 'FLUSH' });
    expect(observed.filter(type => type.startsWith('system/'))).toEqual([]);
    expect(store.middlewareAPI.getState('system')._ready).toBeFalse();
  });

  it('rejects action-creator failures through the module action promise', async () => {
    const module = createModule({
      slice: 'creator', initialState: 0,
      actions: { broken: action('BROKEN', (state: number, _payload: number) => state, () => { throw new Error('creator failed'); }) },
    });
    const store = createStore(); await store.loadModule(module);
    let promise!: Promise<void>;
    expect(() => { promise = module.actions.broken(); }).not.toThrow();
    await expectAsync(promise).toBeRejectedWithError('creator failed');
  });

  it('keeps literal dotted reducer keys distinct from nested reducer paths', async () => {
    const reducer = combineReducers({ 'a.b': (state = 1) => state, a: { b: (state = 2) => state } });
    expect(await reducer(undefined, { type: '@@INIT' })).toEqual({ 'a.b': 1, a: { b: 2 } });
  });
});
