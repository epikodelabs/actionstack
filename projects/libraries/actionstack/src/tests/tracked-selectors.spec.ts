import { createSelectorRegistry } from '../lib/tracked-selectors';
import { MutationBatch } from '../lib/mutations';

describe('tracked custom selectors', () => {
  it('preserves proxy identity and isolates literal path segments and symbols', async () => {
    const key = Symbol('field');
    const state: any = { user: {}, 'a.b': 1, a: { b: 2 }, [key]: 3 };
    const registry = createSelectorRegistry(() => state);
    const identity: boolean[] = [];
    const dotted = jasmine.createSpy().and.callFake((s: any) => s['a.b']);
    const symbolic: number[] = [];
    const subs = [registry.track(s => s.user === s.user).subscribe(v => identity.push(v)),
      registry.track(dotted).subscribe(() => {}),
      registry.track(s => s[key]).subscribe(v => symbolic.push(v))];
    state.a.b++; await registry.notify([['a', 'b']]);
    expect(dotted).toHaveBeenCalledTimes(1);
    state[key]++; await registry.notify([[key]]);
    expect(identity).toEqual([true]);
    expect(symbolic).toEqual([3, 4]);
    for (const sub of subs) await sub();
  });

  it('recovers from null roots and errors while preserving defaults', async () => {
    let state: any = null;
    const registry = createSelectorRegistry(() => state);
    const values: number[] = [];
    const sub = registry.track(s => s.user.n, -1).subscribe(v => values.push(v));
    state = { user: { n: 2 } }; await registry.notify([[]]);
    expect(values).toEqual([-1, 2]);
    spyOn(console, 'warn').and.stub();
    state.user = undefined; await registry.notify([['user']]);
    state.user = { n: 3 }; await registry.notify([['user']]);
    expect(values).toEqual([-1, 2, -1, 3]);
    await sub();
  });

  it('strips proxies from derived Maps and Sets', async () => {
    const state = { user: { n: 1 } };
    const registry = createSelectorRegistry(() => state);
    let selected: any;
    const sub = registry.track(s => ({ map: new Map([['user', s.user]]), set: new Set([s.user]) }))
      .subscribe(v => { selected = v; });
    expect(selected.map.get('user')).toBe(state.user);
    expect([...selected.set][0]).toBe(state.user);
    await sub();
  });

  it('does not wait for a disconnected async selector or publish its stale result', async () => {
    const state = { n: 1 };
    const registry = createSelectorRegistry(() => state);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const values: number[] = [];
    const source = registry.track(async s => { await gate; return s.n; });
    const first = source.subscribe(v => values.push(v));
    await first();
    await registry.settled();
    state.n = 2;
    const second = source.subscribe(v => values.push(v));
    release();
    await registry.settled();
    expect(values).toEqual([2]);
    await second();
  });
  it('distinguishes property traversal, whole-object reads, and unrelated paths', async () => {
    const state = { user: { name: 'Alex', age: 1 }, count: 0 };
    const registry = createSelectorRegistry(() => state);
    const name = jasmine.createSpy('name').and.callFake((s: any) => s.user.name);
    const object = jasmine.createSpy('object').and.callFake((s: any) => s.user);
    const names: string[] = [];
    const objects: any[] = [];
    const a = registry.track(name).subscribe(value => names.push(value));
    const b = registry.track(object).subscribe(value => objects.push(value));
    state.user.age++;
    await registry.notify([['user', 'age']]);
    expect(name).toHaveBeenCalledTimes(1);
    expect(object).toHaveBeenCalledTimes(2);
    expect(objects.length).toBe(2);
    expect(objects[0]).toBe(state.user);
    expect(objects[1]).toBe(state.user);
    expect(names).toEqual(['Alex']);
    await a(); await b();
  });

  it('refreshes conditional dependencies and tracks membership and enumeration', async () => {
    const state: any = { flag: true, a: 1, b: 2, record: {} };
    const registry = createSelectorRegistry(() => state);
    const conditional = jasmine.createSpy().and.callFake((s: any) => s.flag ? s.a : s.b);
    const values: number[] = [];
    const exists: boolean[] = [];
    const keys: string[][] = [];
    const subs = [registry.track(conditional).subscribe(v => values.push(v)),
      registry.track(s => 'x' in s.record).subscribe(v => exists.push(v)),
      registry.track(s => Object.keys(s.record)).subscribe(v => keys.push(v))];
    state.flag = false; await registry.notify([['flag']]);
    state.a = 3; await registry.notify([['a']]);
    expect(conditional).toHaveBeenCalledTimes(2);
    state.record.x = undefined; await registry.notify([['record', 'x']]);
    expect(values).toEqual([1, 2]);
    expect(exists).toEqual([false, true]);
    expect(keys).toEqual([[], ['x']]);
    for (const sub of subs) await sub();
  });

  it('reruns array selections once per batch and strips nested tracking proxies', async () => {
    let state = { items: [{ n: 1 }, { n: 2 }], other: 0 };
    const registry = createSelectorRegistry(() => state);
    const selection = jasmine.createSpy().and.callFake((s: any) => ({ items: s.items, first: s.items[0] }));
    const values: any[] = [];
    const sub = registry.track(selection).subscribe(v => values.push(v));
    const batch = new MutationBatch(state);
    await batch.run([], draft => { draft.items[0].n++; draft.items.push({ n: 3 }); });
    state = batch.commit();
    await registry.notify(batch.changes);
    expect(selection).toHaveBeenCalledTimes(2);
    expect(values[1].items).toBe(state.items);
    expect(values[1].first).toBe(state.items[0]);
    await sub();
  });

  it('coalesces pending async invalidations and drops stale results', async () => {
    const state = { n: 1 };
    const registry = createSelectorRegistry(() => state);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    const values: number[] = [];
    const sub = registry.track(async s => {
      calls++;
      const n = s.n;
      await gate;
      return n + s.n;
    }).subscribe(v => values.push(v));
    state.n = 2; const first = registry.notify([['n']]);
    state.n = 3; const second = registry.notify([['n']]);
    release();
    await Promise.all([first, second, registry.settled()]);
    expect(calls).toBe(2);
    expect(values).toEqual([6]);
    await sub();
  });

  it('disconnects dependencies and refreshes on resubscribe', async () => {
    const state = { n: 1 };
    const registry = createSelectorRegistry(() => state);
    const selector = jasmine.createSpy().and.callFake((s: any) => s.n);
    const source = registry.track(selector);
    const first = source.subscribe(() => {});
    await first();
    state.n = 2; await registry.notify([['n']]);
    expect(selector).toHaveBeenCalledTimes(1);
    const values: number[] = [];
    const second = source.subscribe(v => values.push(v));
    expect(values).toEqual([2]);
    await second();
  });
});
