import { action, createModule, createStore } from '@epikodelabs/actionstack';

describe('immutable store integration', () => {
  beforeEach(() => {
    spyOn(console, 'log').and.stub();
    spyOn(console, 'warn').and.stub();
  });

  function feature() {
    return createModule({
      slice: 'immutable',
      initialState: { items: [{ n: 1 }], count: 0 },
      actions: {
        change: action('CHANGE', (s: { items: { n: number }[]; count: number }) => {
          s.items[0].n++;
          s.items.push({ n: 2 });
        }),
        count: action('COUNT', (s: { items: { n: number }[]; count: number }) => { s.count++; }),
      },
      selectors: {
        items: (s: { items: { n: number }[]; count: number }) => s.items,
        count: (s: { items: { n: number }[]; count: number }) => s.count,
      },
    });
  }

  it('commits by default into a new frozen tree and keeps previous snapshots valid', async () => {
    const store = createStore();
    await store.loadModule(feature());
    await store.dispatch({ type: 'FLUSH' });
    const before = store.middlewareAPI.getState() as any;
    const beforeItems = before.immutable.items;
    const beforeItem = beforeItems[0];

    await store.dispatch({ type: 'immutable/CHANGE' });

    const after = store.middlewareAPI.getState() as any;
    expect(after).not.toBe(before);
    expect(after.immutable).not.toBe(before.immutable);
    expect(after.immutable.items).not.toBe(beforeItems);
    expect(after.immutable.items).toEqual([{ n: 2 }, { n: 2 }]);
    // The previous snapshot keeps its contents and holds frozen data.
    expect(beforeItems).toEqual([{ n: 1 }]);
    expect(beforeItem).toEqual({ n: 1 });
    expect(Object.isFrozen(after)).toBeTrue();
    expect(Object.isFrozen(after.immutable.items[0])).toBeTrue();
    expect(Object.isFrozen(beforeItems)).toBeTrue();
  });

  it('shares untouched branches between commits', async () => {
    const store = createStore();
    await store.loadModule(feature());
    await store.dispatch({ type: 'FLUSH' });
    const before = store.middlewareAPI.getState() as any;
    const system = before.system;
    const items = before.immutable.items;

    await store.dispatch({ type: 'immutable/COUNT' });

    const after = store.middlewareAPI.getState() as any;
    expect(after.system).toBe(system);
    expect(after.immutable.items).toBe(items);
    expect(after.immutable.count).toBe(1);
  });

  it('throws when committed state is written directly', async () => {
    const store = createStore();
    await store.loadModule(feature());
    await store.dispatch({ type: 'FLUSH' });
    await store.dispatch({ type: 'immutable/COUNT' });
    const state = store.middlewareAPI.getState() as any;
    expect(() => { state.immutable.count = 5; }).toThrow();
    expect(() => { state.immutable.items.push({ n: 3 }); }).toThrow();
    expect(store.middlewareAPI.getState('immutable')).toEqual({ items: [{ n: 1 }], count: 1 });
  });

  it('reruns only selectors whose tracked paths changed', async () => {
    const store = createStore();
    await store.loadModule(feature());
    await store.dispatch({ type: 'FLUSH' });
    const count = jasmine.createSpy('countSelector').and.callFake((s: any) => s.immutable.count);
    const itemName = jasmine.createSpy('itemSelector').and.callFake((s: any) => s.immutable.items[0].n);
    const subCount = store.select(count).subscribe(() => {});
    const subItem = store.select(itemName).subscribe(() => {});
    expect(count).toHaveBeenCalledTimes(1);
    expect(itemName).toHaveBeenCalledTimes(1);

    await store.dispatch({ type: 'immutable/CHANGE' });

    expect(itemName).toHaveBeenCalledTimes(2);
    expect(count).toHaveBeenCalledTimes(1);

    await store.dispatch({ type: 'immutable/COUNT' });

    expect(count).toHaveBeenCalledTimes(2);
    expect(itemName).toHaveBeenCalledTimes(2);

    await subItem();
    await subCount();
  });

  it('freezes replacement roots', async () => {
    const store = createStore();
    await store.dispatch({ type: 'FLUSH' });
    store.addReducer((_s, a: any) => a.type === 'ROOT' ? { replaced: true } : undefined);

    await store.dispatch({ type: 'ROOT' });

    const root = store.middlewareAPI.getState() as any;
    expect(root).toEqual({ replaced: true });
    expect(Object.isFrozen(root)).toBeTrue();
    expect(() => { root.replaced = false; }).toThrow();
  });

  it('keeps in-place commits behind the preserveImmutableState flag', async () => {
    const store = createStore({ preserveImmutableState: false });
    await store.loadModule(feature());
    await store.dispatch({ type: 'FLUSH' });
    const before = store.middlewareAPI.getState() as any;
    const items = before.immutable.items;

    await store.dispatch({ type: 'immutable/CHANGE' });

    expect(store.middlewareAPI.getState()).toBe(before);
    expect(before.immutable.items).toBe(items);
    expect(before.immutable.items).toEqual([{ n: 2 }, { n: 2 }]);
    expect(Object.isFrozen(before)).toBeFalse();
  });
});
