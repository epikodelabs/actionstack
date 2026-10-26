import { action, createModule, createStore, thunk } from '@epikodelabs/actionstack';

describe('mutable store integration', () => {
  beforeEach(() => {
    spyOn(console, 'log').and.stub();
    spyOn(console, 'warn').and.stub();
  });

  function feature() {
    return createModule({
      slice: 'mutable',
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
      },
    });
  }

  it('commits one action in place and notifies both store and module selections', async () => {
    const store = createStore();
    const module = feature();
    await store.loadModule(module);
    await store.dispatch({ type: 'FLUSH' });
    const root = store.middlewareAPI.getState();
    const reference = root.mutable.items;
    const values: any[] = [];
    const moduleValues: any[] = [];
    const count = jasmine.createSpy().and.callFake((s: any) => s.mutable.count);
    const subs = [store.select((s: any) => s.mutable.items).subscribe(v => values.push(v)),
      module.data$.items().subscribe(v => moduleValues.push(v)),
      store.select(count).subscribe(() => {})];
    await store.dispatch({ type: 'mutable/CHANGE' });
    expect(store.middlewareAPI.getState()).toBe(root);
    expect(root.mutable.items).toBe(reference);
    expect(root.mutable.items).toEqual([{ n: 2 }, { n: 2 }]);
    expect(values.length).toBe(2);
    expect(moduleValues.length).toBe(2);
    expect(count).toHaveBeenCalledTimes(1);
    for (const sub of subs) await sub();
  });

  it('retains successful handler changes when a global reducer fails', async () => {
    const store = createStore();
    await store.loadModule(feature());
    store.addReducer((s, a: any) => { if (a.type === 'mutable/COUNT') s.mutable.count++; });
    store.addReducer((s, a: any) => {
      if (a.type !== 'mutable/COUNT') return;
      s.mutable.count = 100;
      throw new Error('rollback');
    });
    await store.dispatch({ type: 'mutable/COUNT' });
    expect(store.middlewareAPI.getState().mutable.count).toBe(2);
    expect(console.warn).toHaveBeenCalledWith('Error in meta-reducer 1:', 'rollback');
  });

  for (const exclusiveActionProcessing of [false, true]) {
    it(`serializes async drafts with exclusive=${exclusiveActionProcessing}`, async () => {
      const store = createStore({ exclusiveActionProcessing });
      let started!: () => void;
      let release!: () => void;
      const began = new Promise<void>(resolve => { started = resolve; });
      const gate = new Promise<void>(resolve => { release = resolve; });
      let calls = 0;
      const module = createModule({
        slice: 'serial', initialState: { n: 0 },
        actions: {
          increment: action('INC', async (s: { n: number }) => {
            calls++;
            s.n++;
            if (calls === 1) { started(); await gate; }
          }),
        },
      });
      await store.loadModule(module);
      await store.dispatch({ type: 'FLUSH' });
      const first = store.dispatch({ type: 'serial/INC' });
      await began;
      expect(store.middlewareAPI.getState().serial.n).toBe(0);
      const second = store.dispatch({ type: 'serial/INC' });
      await Promise.resolve();
      expect(calls).toBe(1);
      release();
      await Promise.all([first, second]);
      expect(store.middlewareAPI.getState().serial.n).toBe(2);
    });

    it(`supports nested thunk dispatch with exclusive=${exclusiveActionProcessing}`, async () => {
      const store = createStore({ exclusiveActionProcessing });
      await store.loadModule(feature());
      await store.dispatch(async dispatch => {
        await dispatch({ type: 'mutable/COUNT' });
        await dispatch({ type: 'mutable/COUNT' });
      });
      expect(store.middlewareAPI.getState().mutable.count).toBe(2);
    });
  }

  it('awaits module action methods until processing completes', async () => {
    const store = createStore();
    let thunkDone = false;
    const module = createModule({
      slice: 'awaited',
      initialState: { count: 0 },
      actions: {
        inc: action('INC', (s: { count: number }) => { s.count++; }),
        finish: thunk('FINISH', () => async () => {
          await new Promise(resolve => setTimeout(resolve, 20));
          thunkDone = true;
          return 'payload';
        }),
      },
    });
    await store.loadModule(module);
    await store.dispatch({ type: 'FLUSH' });

    await module.actions.inc();
    expect(store.middlewareAPI.getState('awaited')).toEqual({ count: 1 });

    const result = await module.actions.finish();
    expect(thunkDone).toBeTrue();
    expect(result).toBe('payload');
  });

  it('resolves module thunk actions with their return value in both processing modes', async () => {
    for (const exclusiveActionProcessing of [false, true]) {
      const store = createStore({ exclusiveActionProcessing });
      const module = createModule({
        slice: 'answered',
        initialState: {},
        actions: { answer: thunk('ANSWER', () => async () => 42) },
      });
      await store.loadModule(module);
      expect(await module.actions.answer()).toBe(42);
    }
  });

  it('never delivers the stale cached value to subscribers attaching during a pending async selection', async () => {
    const store = createStore();
    const module = createModule({
      slice: 'stale',
      initialState: { n: 0 },
      actions: { bump: action('BUMP', (s: { n: number }) => { s.n = 1; }) },
      selectors: { current: (s: { n: number }) => s.n },
    });
    await store.loadModule(module);
    await store.dispatch({ type: 'FLUSH' });

    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let observed!: () => void;
    const pending = new Promise<void>(resolve => { observed = resolve; });
    let started = false;
    const values: number[] = [];
    const sub1 = store.select(async (s: any) => {
      if (started) { observed(); await gate; }
      return s.stale.n;
    }).subscribe(v => values.push(v));

    started = true;
    const dispatch = store.dispatch({ type: 'stale/BUMP' });
    await pending;   // the fresh evaluation is now in flight
    // Attach while the re-evaluation is pending: the cache still holds 0.
    const second: number[] = [];
    const sub2 = store.select((s: any) => s.stale.n, -1).subscribe(v => second.push(v));
    release();
    await dispatch;
    expect(second).toEqual([1]);
    await sub2();
    await sub1();
  });

  it('rejects failed module actions but keeps triggered thunk failures log-only', async () => {
    const store = createStore();
    const module = createModule({
      slice: 'failing',
      initialState: { count: 0 },
      actions: {
        boom: action('BOOM', (s: { count: number }) => {
          s.count++;
          throw new Error('handler failed');
        }),
        react: thunk('REACT', () => async () => { throw new Error('triggered failed'); },
          ['failing/OK']),
        ok: action('OK', () => {}),
      },
    });
    await store.loadModule(module);
    await store.dispatch({ type: 'FLUSH' });

    await expectAsync(module.actions.boom()).toBeRejectedWithError('handler failed');
    await module.actions.ok();
    expect(store.middlewareAPI.getState('failing')).toEqual({ count: 0 });
  });

  it('awaits affected async selectors but permits later reducer commits', async () => {
    const store = createStore({ awaitStatePropagation: true });
    await store.loadModule(feature());
    await store.dispatch({ type: 'FLUSH' });
    let release!: () => void;
    let observed!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { observed = resolve; });
    const values: number[] = [];
    const sub = store.select(async (s: any) => {
      const count = s.mutable.count;
      if (count) { observed(); await gate; }
      return count;
    }).subscribe(v => values.push(v));
    await Promise.resolve(); await Promise.resolve();
    let finished = false;
    const dispatch = store.dispatch({ type: 'mutable/COUNT' }).then(() => { finished = true; });
    await started;
    const later = store.dispatch({ type: 'mutable/COUNT' });
    // Read through the reducer queue, without awaiting propagation.
    await store.getState('mutable', s => expect((s as any).count).toBe(2));
    expect(finished).toBeFalse();
    release();
    await Promise.all([dispatch, later]);
    expect(values[values.length - 1]).toBe(2);
    expect(values).not.toContain(1);
    await sub();
  });

  it('invalidates selections for module loading, clearing, and root replacement', async () => {
    const store = createStore();
    await store.dispatch({ type: 'FLUSH' });
    const values: any[] = [];
    const sub = store.select((s: any) => s.mutable, null).subscribe(v => values.push(v));
    const module = feature();
    await store.loadModule(module);
    await store.unloadModule(module, true);
    expect(values.length).toBe(3);
    expect(values[0]).toBeNull();
    expect(values[1].count).toBe(0);
    expect(values[2]).toBeNull();
    store.addReducer((_s, a: any) => a.type === 'ROOT' ? { replaced: true } : undefined);
    await store.dispatch({ type: 'ROOT' });
    expect(store.middlewareAPI.getState()).toEqual({ replaced: true });
    await sub();
  });
});
