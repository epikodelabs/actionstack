import { action, createModule, createStore } from '@epikodelabs/actionstack';
import { atom } from '@epikodelabs/streamix';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('module current source readiness', () => {
  beforeEach(() => { spyOn(console, 'log').and.stub(); });

  async function feature() {
    const store = createStore();
    let gate: Promise<void> = Promise.resolve();
    const module = createModule({
      slice: 'readiness', initialState: { n: 1 },
      actions: { set: action('SET', (_state: { n: number }, n: number) => ({ n })) },
      selectors: { n: async (state: { n: number }) => { const n = state.n; await gate; return n % 2; } },
    });
    await store.loadModule(module);
    await store.dispatch({ type: 'FLUSH' });
    return { store, module, pause: (promise: Promise<void>) => { gate = promise; } };
  }

  for (const next of [2, 3]) {
    it(`waits for the confirmed async value on reconnect (${next})`, async () => {
      const { module, pause } = await feature();
      const source = module.data$.n();
      const initial: number[] = [];
      const first = source.subscribe(value => initial.push(value));
      await settle(); await first();
      const gate = deferred(); pause(gate.promise);
      await module.actions.set(next);
      const values: number[] = [];
      const second = source.subscribe(value => values.push(value));
      expect(initial).toEqual([1]);
      expect(values).toEqual([]);
      gate.resolve(); await settle();
      expect(values).toEqual([next % 2]);
      await second();
    });
  }

  it('confirms equal pending results for joining subscribers without duplicating existing ones', async () => {
    const { module, pause } = await feature();
    const source = module.data$.n();
    const a: number[] = [];
    const first = source.subscribe(value => a.push(value));
    await settle();
    const gate = deferred(); pause(gate.promise);
    await module.actions.set(3);
    const b: number[] = [];
    const second = source.subscribe(value => b.push(value));
    expect(b).toEqual([]);
    gate.resolve(); await settle();
    expect(a).toEqual([1]);
    expect(b).toEqual([1]);
    const c: number[] = [];
    const third = source.subscribe(value => c.push(value));
    expect(c).toEqual([1]);
    await first(); await second(); await third();
  });

  it('does not dispose a replacement connection while prior teardown is settling', async () => {
    const { module } = await feature();
    const source = module.data$.n();
    const first = source.subscribe(() => {});
    await settle();
    const cleanup = first();
    const values: number[] = [];
    const second = source.subscribe(value => values.push(value));
    await cleanup; await settle();
    await module.actions.set(2); await settle();
    expect(values).toEqual([1, 0]);
    await second();
  });

  it('forwards upstream errors and continues after the upstream recovers', () => {
    const upstream = atom(1);
    const module = createModule({ slice: 'errors', initialState: 1, selectors: { n: (n: number) => n } });
    module.configure({ select: () => upstream } as any);
    const source = module.data$.n();
    const values: number[] = [];
    const errors: unknown[] = [];
    const errorSub = source.onError(error => errors.push(error));
    const sub = source.subscribe(value => values.push(value));
    const failure = new Error('upstream');
    upstream.fail(failure);
    upstream.next(2);
    expect(errors).toEqual([failure]);
    expect(values).toEqual([1, 2]);
    void sub(); void errorSub();
  });
});
