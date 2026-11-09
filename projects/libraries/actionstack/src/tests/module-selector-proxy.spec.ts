import { action, createModule, createStore } from '@epikodelabs/actionstack';
import { isAtom } from '@epikodelabs/streamix';
import type { Atom } from '@epikodelabs/streamix';

const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('module selector proxy and data$', () => {
  beforeEach(() => {
    spyOn(console, 'log').and.stub();
    spyOn(console, 'warn').and.stub();
  });

  function makeModule() {
    return createModule({
      slice: 'deferred',
      initialState: { n: 7 },
      dependencies: {},
      actions: { set: action('SET', (_state: { n: number }, n: number) => ({ n })) },
      selectors: { n: (state: { n: number }) => state.n },
    });
  }

  it('retains selector inference and exposes a separate Atom-typed data$ view', async () => {
    const mod = makeModule();
    const value: number = (mod.selectors.n as any)({ deferred: { n: 42 } });
    const source: Atom<number> = mod.data$.n;
    expect(value).toBe(42);
    // A callable selector must not be mistaken for an Atom by Streamix.
    expect(isAtom(mod.selectors.n)).toBeFalse();
    expect(isAtom(source)).toBeTrue();
    expect(source.type).toBe('atom');
    expect(typeof mod.selectors.n).toBe('function');
    const previous = source;
    expect(mod.data$.n).toBe(previous);

    const store = createStore({ dispatchSystemActions: false });
    await store.loadModule(mod);
    const seen: number[] = [];
    const off = source.subscribe(n => seen.push(n));
    expect(seen).toEqual([7]);
    await off();
  });

  it('is detected as a reactive source by the app1 Angular *atom directive', async () => {
    // Mirrors isDependencySource in projects/apps/app1/src/app/atom.directive.ts.
    const isDependencySource = (value: unknown): boolean =>
      value !== null && typeof value === 'object' &&
      'subscribe' in value && 'value' in value &&
      typeof (value as any).subscribe === 'function';

    const mod = createModule({
      slice: 'heroes',
      initialState: { heroes: [{ id: 1, name: 'Dr. Nice' }], loading: false },
      actions: {},
      selectors: {
        selectHeroes: (state: { heroes: { id: number; name: string }[] }) => state.heroes,
        selectLoading: (state: { loading: boolean }) => state.loading,
      },
    });
    const heroes = mod.data$.selectHeroes;
    const loading = mod.data$.selectLoading;
    expect(isDependencySource(heroes)).toBeTrue();
    expect(isDependencySource(loading)).toBeTrue();
    expect('value' in mod.selectors.selectHeroes).toBeTrue();
    expect('subscribe' in mod.selectors.selectHeroes).toBeTrue();

    const store = createStore({ dispatchSystemActions: false });
    await store.loadModule(mod);
    // app1 calls .value before it subscribes: after load the synchronous
    // selection must already be available on that very first read.
    expect(heroes.value).toEqual([{ id: 1, name: 'Dr. Nice' }]);
    expect(loading.value).toBeFalse();
    let heroList: unknown = heroes.value;
    const unsubscribe = heroes.subscribe(items => { heroList = items; });
    expect(heroList).toEqual([{ id: 1, name: 'Dr. Nice' }]);
    let isLoading: unknown = loading.value;
    const offLoading = loading.subscribe(value => { isLoading = value; });
    expect(isLoading).toBeFalse();
    await unsubscribe();
    await offLoading();
  });

  it('retains unsubscribe ownership for parked subscriptions after attachment', async () => {
    const mod = makeModule();
    const seen: number[] = [];
    const off = mod.data$.n.subscribe(n => seen.push(n));
    const store = createStore({ dispatchSystemActions: false });
    await store.loadModule(mod);
    expect(seen).toEqual([7]);
    await off();
    await mod.actions.set(12);
    expect(seen).toEqual([7]);
  });

  it('does not attach listeners cancelled before configuration', async () => {
    const mod = makeModule();
    const seen: number[] = [];
    const off = mod.data$.n.subscribe(n => seen.push(n));
    await off();
    const store = createStore({ dispatchSystemActions: false });
    await store.loadModule(mod);
    await mod.actions.set(8);
    expect(seen).toEqual([]);
  });

  it('forwards listeners installed before configuration without a second value cache', async () => {
    const mod = makeModule();
    const seen: number[] = [];
    const source = mod.data$.n;
    const off = source.subscribe(n => seen.push(n));
    const store = createStore({ dispatchSystemActions: false });
    const original = store.select.bind(store);
    let calls = 0;
    (store as any).select = (...args: any[]) => { calls++; return original(...args as [any]); };
    await store.loadModule(mod);
    const other = source.subscribe(() => {});
    expect(calls).toBe(1);
    expect(seen).toEqual([7]);
    await off(); await other();
  });

  it('cancels async iterator waiting for module configuration', async () => {
    const mod = makeModule();
    const iterator = mod.data$.n[Symbol.asyncIterator]();
    const first = iterator.next();
    const cancelled = await iterator.return!();
    expect(cancelled.done).toBeTrue();
    const result = await first;
    expect(result.done).toBeTrue();
    const store = createStore({ dispatchSystemActions: false });
    await store.loadModule(mod);
  });

  it('parks subscriptions made before the store is configured and attaches them at load', async () => {
    const mod = makeModule();
    const seen1: number[] = [];
    const seen2: number[] = [];
    const off1 = mod.data$.n.subscribe((value: number) => seen1.push(value));
    const off2 = mod.data$.n.subscribe((value: number) => seen2.push(value));
    expect(seen1).toEqual([]);
    expect(seen2).toEqual([]);

    const store = createStore({ dispatchSystemActions: false });
    await store.loadModule(mod);

    expect(seen1).toEqual([7]);
    expect(seen2).toEqual([7]);
    off1();
    off2();
  });

  it('attaches immediately when the store is already configured', async () => {
    const store = createStore({ dispatchSystemActions: false });
    const mod = makeModule();
    await store.loadModule(mod);

    const seen: number[] = [];
    mod.data$.n.subscribe((value: number) => seen.push(value));
    expect(seen).toEqual([7]);
  });

  it('shares one tracked selector across subscribers', async () => {
    const store = createStore({ dispatchSystemActions: false });
    let selectCalls = 0;
    const originalSelect = store.select.bind(store);
    (store as any).select = (...args: any[]) => {
      selectCalls++;
      return originalSelect(...(args as [any]));
    };

    const mod = makeModule();
    await store.loadModule(mod);

    const off1 = mod.data$.n.subscribe(() => {});
    const off2 = mod.data$.n.subscribe(() => {});
    expect(selectCalls).toBe(1);
    off1();
    off2();
  });

  it('answers synchronous value reads without needing a first subscription', async () => {
    const mod = makeModule();
    const before = (mod.data$.n as any).value;
    expect(typeof before === 'symbol' || before === undefined).toBeTrue();

    const store = createStore({ dispatchSystemActions: false });
    await store.loadModule(mod);
    const source = mod.data$.n;
    expect(source.value).toBe(7);
    expect(source.safeValue).toBe(7);
    expect(mod.selectors.n.value).toBe(7);
    expect(source.subscriberCount).toBe(0);
    const seen: number[] = [];
    const unsubscribe = source.subscribe(v => seen.push(v));
    expect(seen).toEqual([7]);
    await unsubscribe();
    await mod.actions.set(12);
    expect(source.value).toBe(12);
    expect(source.safeValue).toBe(12);
    expect(source.subscriberCount).toBe(0);
    expect(seen).toEqual([7]);
  });

  it('is async-iterable after the module loads', async () => {
    const store = createStore({ dispatchSystemActions: false });
    const mod = makeModule();
    await store.loadModule(mod);

    const received: number[] = [];
    const iterate = async () => {
      for await (const value of mod.data$.n as any) {
        received.push(value);
        if (received.length >= 3) break;
      }
    };
    const finished = iterate();
    await store.dispatch({ type: 'deferred/SET', payload: 8 });
    await settle();
    await store.dispatch({ type: 'deferred/SET', payload: 9 });
    await finished;

    expect(received).toEqual([7, 8, 9]);
  });

  it('disposes on unload and serves fresh streams after reload', async () => {
    const store = createStore({ dispatchSystemActions: false });
    const mod = makeModule();
    await store.loadModule(mod);
    const first = mod.data$.n.subscribe(() => {});
    first();
    await store.unloadModule(mod);
    expect((mod.data$.n as any).disposed).toBeTrue();

    await store.loadModule(mod);
    const seen: number[] = [];
    const second = mod.data$.n.subscribe((value: number) => seen.push(value));
    expect(seen).toEqual([7]);
    second();
  });
});
