import { atom, NO_INITIAL_VALUE } from '@epikodelabs/streamix';
import { selectStream, selectStreamAsync } from '../lib/selectors';
import { createSelectorRegistry } from '../lib/tracked-selectors';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('native Streamix-backed selections (no current-source cache)', () => {
  it('supports synchronous cold value reads from selectStream without a subscriber', async () => {
    const state = atom({ count: 1 });
    const selected = selectStream(s => s.count, state);
    expect(selected.value).toBe(1);
    expect(selected.safeValue).toBe(1);
    expect(selected.subscriberCount).toBe(0);
    state.next({ count: 2 });
    expect(selected.value).toBe(2);
    const seen: number[] = [];
    const off = selected.subscribe(v => seen.push(v));
    expect(seen).toEqual([2]);
    await off();
    selected.dispose();
    state.dispose();
  });

  it('supports cold tracked selection reads without retaining path listeners', async () => {
    const state = { n: 1, other: false };
    const registry = createSelectorRegistry(() => state);
    let calls = 0;
    const selected = registry.track(s => { calls++; return s.n; });
    expect(selected.value).toBe(1);
    expect(selected.safeValue).toBe(1);
    expect(calls).toBe(2); // each cold read pulls the current input
    expect(selected.subscriberCount).toBe(0);
    state.other = true;
    await registry.notify([['other']]);
    expect(calls).toBe(2); // no retained path listener
    state.n = 5;
    await registry.notify([['n']]);
    expect(selected.value).toBe(5);
    const values: number[] = [];
    const off = selected.subscribe(value => values.push(value));
    expect(values).toEqual([5]);
    await off();
    state.n = 7;
    await registry.notify([['n']]);
    expect(selected.value).toBe(7);
    expect(values).toEqual([5]);
  });

  it('keeps async cold reads unavailable until an active subscription settles', async () => {
    const state = { n: 1 };
    const registry = createSelectorRegistry(() => state);
    const gate = deferred<number>();
    const selected = registry.track(async () => gate.promise);
    expect(selected.value).toBe(NO_INITIAL_VALUE);
    expect(selected.subscriberCount).toBe(0);
    const values: number[] = [];
    const off = selected.subscribe(v => values.push(v));
    gate.resolve(11);
    await registry.settled();
    expect(values).toEqual([11]);
    expect(selected.value).toBe(11);
    await off();
  });

  it('preserves equal selectStream emissions and synchronously refreshes when reconnecting', async () => {
    const state = atom({ count: 1 });
    const selected = selectStream(s => s.count, state);
    const first: number[] = [];
    const stopFirst = selected.subscribe(v => first.push(v));
    expect(first).toEqual([1]);
    state.next({ count: 1 });
    expect(first).toEqual([1, 1]);
    await stopFirst();
    state.next({ count: 2 });
    const second: number[] = [];
    const stopSecond = selected.subscribe(v => second.push(v));
    expect(second).toEqual([2]);
    await stopSecond();
    selected.dispose();
    state.dispose();
  });

  it('only publishes the newest async selectStream value', async () => {
    const state = atom(1);
    const old = deferred<number>();
    const fresh = deferred<number>();
    const selected = selectStreamAsync(n => n === 1 ? old.promise : fresh.promise, state);
    const values: number[] = [];
    const off = selected.subscribe(value => values.push(value));
    state.next(2);
    fresh.resolve(20);
    await tick();
    old.resolve(10);
    await tick();
    expect(values).toEqual([20]);
    await off();
    selected.dispose();
    state.dispose();
  });

  it('does not publish a promise resolved after the last subscriber disconnects', async () => {
    const state = atom(1);
    const gate = deferred<number>();
    const selected = selectStreamAsync(() => gate.promise, state);
    const off = selected.subscribe(() => fail('stale result reached a disconnected subscriber'));
    await off();
    gate.resolve(99);
    await tick();
    expect(selected.safeValue).not.toBe(99);
    selected.dispose();
    state.dispose();
  });

  it('confirms equal async tracked values for new subscribers only', async () => {
    const state = { count: 1 };
    const registry = createSelectorRegistry(() => state);
    let wait: Promise<void> = Promise.resolve();
    const selected = registry.track(async s => {
      const n = s.count;
      await wait;
      return n % 2;
    });
    const existing: number[] = [];
    const first = selected.subscribe(value => existing.push(value));
    await tick();
    expect(existing).toEqual([1]);

    const gate = deferred<void>();
    wait = gate.promise;
    state.count = 3;
    const updating = registry.notify([['count']]);
    const joining: number[] = [];
    const second = selected.subscribe(value => joining.push(value));
    expect(joining).toEqual([]);
    gate.resolve();
    await updating;
    await registry.settled();
    expect(existing).toEqual([1]);
    expect(joining).toEqual([1]);
    await first(); await second();
  });

  it('preserves path-granular invalidation and changes to mutable object selections', async () => {
    const state = { person: { name: 'A', age: 1 }, unrelated: true };
    const registry = createSelectorRegistry(() => state);
    let calls = 0;
    const selected = (s: typeof state) => { calls++; return s.person; };
    const values: typeof state.person[] = [];
    const off = registry.track(selected).subscribe(value => values.push(value));
    state.unrelated = false;
    await registry.notify([['unrelated']]);
    expect(calls).toBe(1);
    state.person.age = 2;
    await registry.notify([['person', 'age']]);
    expect(calls).toBe(2);
    expect(values).toEqual([state.person, state.person]);
    await off();
  });
});
