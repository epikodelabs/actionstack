import { MutationBatch } from '../lib/mutations';
import { createSelectorRegistry } from '../lib/tracked-selectors';
import { action, createModule, createStore } from '@epikodelabs/actionstack';

describe('collection drafts and selections', () => {
  it('journals Map operations and commits them onto the original instance', async () => {
    const original = new Map<any, any>([['a', 1], ['b', { n: 1 }]]);
    const state = { registry: original };
    const batch = new MutationBatch(state);
    let retained: any;
    await batch.run([], draft => {
      retained = draft.registry;
      expect(retained instanceof Map).toBeTrue();
      expect(retained.get('a')).toBe(1);
      retained.set('a', 10);
      retained.set('c', 3);
      expect(retained.size).toBe(3);
      expect(retained.has('b')).toBeTrue();
      expect([...retained.keys()]).toEqual(['a', 'b', 'c']);
      for (const [key] of retained.entries()) if (key === 'b') retained.delete(key);
      expect(original.get('a')).toBe(1);
    });
    expect(() => retained.get('a')).toThrow();
    expect(original.get('a')).toBe(1);
    batch.commit();
    expect(state.registry).toBe(original);
    expect([...original.entries()]).toEqual([['a', 10], ['c', 3]]);
    expect(batch.changes).toEqual([['registry'], ['registry'], ['registry']]);
  });

  it('tracks nested writes inside Map values and Set members', async () => {
    const shared = { n: 1 };
    const originalMap = new Map([['user', { name: 'old' }]]);
    const originalSet = new Set([shared]);
    const state = { map: originalMap, set: originalSet };
    const batch = new MutationBatch(state);
    await batch.run([], draft => {
      draft.map.get('user').name = 'new';
      for (const item of draft.set) item.n = 5;
    });
    batch.commit();
    expect(originalMap.get('user')!.name).toBe('new');
    expect(shared.n).toBe(5);
    expect(batch.changes).toEqual([['map', 'user', 'name'], ['set', 0, 'n']]);
  });

  it('shares pending collection operations across stages and rolls back failed stages', async () => {
    const original = new Map([['n', 1]]);
    const state = { m: original };
    const batch = new MutationBatch(state);
    await batch.run([], draft => { draft.m.set('n', 2); });
    await expectAsync(batch.run([], draft => {
      expect(draft.m.get('n')).toBe(2);
      draft.m.set('n', 3);
      throw new Error('fail');
    })).toBeRejectedWithError('fail');
    await batch.run([], draft => {
      expect(draft.m.get('n')).toBe(2);
      draft.m.set('n', 4);
    });
    batch.commit();
    expect(original.get('n')).toBe(4);
  });

  it('mutates Date drafts in place with reads and formatting', async () => {
    const original = new Date(2026, 0, 1);
    const state = { created: original };
    const batch = new MutationBatch(state);
    await batch.run([], draft => {
      expect(draft.created.getFullYear()).toBe(2026);
      draft.created.setFullYear(2027);
      draft.created.setMonth(5);
      expect(draft.created.getFullYear()).toBe(2027);
      expect(original.getFullYear()).toBe(2026);
      expect(typeof draft.created.toISOString()).toBe('string');
    });
    batch.commit();
    expect(state.created).toBe(original);
    expect(original.getFullYear()).toBe(2027);
    expect(original.getMonth()).toBe(5);
  });

  it('still supports whole replacements and skips no-op collection writes', async () => {
    const original = new Map([['a', 1]]);
    const state = { m: original };
    const batch = new MutationBatch(state);
    await batch.run([], draft => {
      draft.m.set('a', 1);
      draft.m = new Map([['b', 2]]);
    });
    expect(batch.changes).toEqual([['m']]);
    batch.commit();
    expect(state.m).not.toBe(original);
    expect([...state.m.entries()]).toEqual([['b', 2]]);
  });

  it('preflights frozen collections before committing', async () => {
    const frozen = new Set([1]);
    Object.freeze(frozen);
    const state = { s: frozen };
    const batch = new MutationBatch(state);
    await batch.run([], draft => { draft.s.add(2); });
    expect(() => batch.commit()).toThrowError(/must be mutable/);
    expect(frozen.size).toBe(1);
  });

  it('selects Map contents with whole-collection invalidation', async () => {
    const state: any = { registry: new Map([['a', 1]]), other: 0 };
    const registry = createSelectorRegistry(() => state);
    const reads = jasmine.createSpy().and.callFake((s: any) => s.registry.get('a'));
    const values: number[] = [];
    const sub = registry.track(reads).subscribe(v => values.push(v));
    expect(values).toEqual([1]);
    state.other++; await registry.notify([['other']]);
    expect(reads).toHaveBeenCalledTimes(1);
    state.registry.set('a', 2); await registry.notify([['registry']]);
    expect(reads).toHaveBeenCalledTimes(2);
    expect(values).toEqual([1, 2]);
    await sub();
  });

  it('selects Set and Date values through their read methods', async () => {
    const state = { created: new Date(2026, 0, 1), tags: new Set(['x']) };
    const registry = createSelectorRegistry(() => state);
    const dates: number[] = [];
    const sizes: number[] = [];
    const subs = [registry.track(s => s.created.getTime()).subscribe(v => dates.push(v)),
      registry.track(s => s.tags.size).subscribe(v => sizes.push(v))];
    const batch = new MutationBatch(state);
    await batch.run([], draft => { draft.created.setMonth(6); draft.tags.add('y'); });
    batch.commit();
    await registry.notify(batch.changes);
    expect(dates.length).toBe(2);
    expect(new Date(dates[1]).getMonth()).toBe(6);
    expect(sizes).toEqual([1, 2]);
    for (const sub of subs) await sub();
  });

  it('exposes live members from Map selections', async () => {
    const state = { m: new Map([['user', { name: 'a' }]]) };
    const registry = createSelectorRegistry(() => state);
    const names: string[] = [];
    const sub = registry.track(s => s.m.get('user').name).subscribe(v => names.push(v));
    expect(names).toEqual(['a']);
    const batch = new MutationBatch(state);
    await batch.run([], draft => { draft.m.get('user').name = 'b'; });
    batch.commit();
    await registry.notify(batch.changes);
    expect(names).toEqual(['a', 'b']);
    await sub();
  });

  it('returns raw collections from selections and re-emits on nested commits', async () => {
    const original = new Map([['k', { n: 1 }]]);
    const state = { m: original };
    const registry = createSelectorRegistry(() => state);
    const values: any[] = [];
    const sub = registry.track(s => s.m).subscribe(v => values.push(v));
    expect(values[0]).toBe(original);
    const batch = new MutationBatch(state);
    await batch.run([], draft => { draft.m.get('k').n = 2; });
    batch.commit();
    await registry.notify(batch.changes);
    expect(values.length).toBe(2);
    expect(values[1].get('k').n).toBe(2);
    await sub();
  });

  it('rejects selector-side collection mutation and recovers on the next commit', async () => {
    const state = { m: new Map([['a', 1]]) };
    const registry = createSelectorRegistry(() => state);
    spyOn(console, 'warn').and.stub();
    let attempt = true;
    const values: number[] = [];
    const sub = registry.track(s => {
      if (attempt) { attempt = false; s.m.set('a', 99); }
      return s.m.get('a');
    }, -1).subscribe(v => values.push(v));
    expect(values).toEqual([-1]);
    expect(console.warn).toHaveBeenCalled();
    expect(state.m.get('a')).toBe(1);
    state.m.set('a', 2); await registry.notify([['m']]);
    expect(values).toEqual([-1, 2]);
    await sub();
  });

  it('mutates collections through module actions with tracked data streams', async () => {
    const store = createStore();
    const module = createModule({
      slice: 'index',
      initialState: { byId: new Map<string, { name: string }>([['1', { name: 'old' }]]) },
      actions: {
        rename: action('RENAME', (s: { byId: Map<string, { name: string }> }) => {
          s.byId.get('1')!.name = 'new';
        }),
        replace: action('REPLACE', (s: { byId: Map<string, { name: string }> }) => {
          s.byId = new Map([['2', { name: 'two' }]]);
        }),
      },
      selectors: {
        first: (s: { byId: Map<string, { name: string }> }) => s.byId.get('1')?.name,
      },
    });
    await store.loadModule(module);
    await store.dispatch({ type: 'FLUSH' });
    const values: (string | undefined)[] = [];
    const sub = module.data$.first().subscribe(v => values.push(v));
    await store.dispatch({ type: 'index/RENAME' });
    expect(values).toEqual(['old', 'new']);
    await store.dispatch({ type: 'index/REPLACE' });
    expect(values).toEqual(['old', 'new', undefined]);
    await sub();
  });
});
