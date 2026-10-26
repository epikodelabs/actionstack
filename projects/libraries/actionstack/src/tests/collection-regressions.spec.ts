import { MutationBatch, validateTree } from '../lib/mutations';

describe('collection transaction regressions', () => {
  it('keeps original member identity for delete and no-op add after staged member edits', async () => {
    const key = { id: 1 };
    const member = { n: 1 };
    const state = { map: new Map([[key, 1]]), set: new Set([member]) };
    const batch = new MutationBatch(state);
    await batch.run([], draft => {
      [...draft.map.keys()][0].id++;
      [...draft.set][0].n++;
    });
    await batch.run([], draft => {
      expect(draft.set.has(member)).toBeTrue();
      draft.set.add(member);
      expect(draft.set.size).toBe(1);
      expect(draft.map.delete(key)).toBeTrue();
      expect(draft.set.delete(member)).toBeTrue();
    });
    batch.commit();
    expect(state.map.size).toBe(0);
    expect(state.set.size).toBe(0);
  });

  it('does not rebuild committed collections for a no-op transaction', async () => {
    const state = { map: new Map([['a', 1], ['b', 2]]) };
    const iterator = state.map.keys();
    expect(iterator.next().value).toBe('a');
    const batch = new MutationBatch(state);
    await batch.run([], draft => { expect(draft.map.get('a')).toBe(1); });
    batch.commit();
    expect(iterator.next().value).toBe('b');
    expect(iterator.next().done).toBeTrue();
  });

  it('rejects collection custom properties before executing draft callbacks', async () => {
    const map = new Map();
    const getter = jasmine.createSpy().and.returnValue({ n: 1 });
    Object.defineProperty(map, 'metadata', { get: getter });
    const batch = new MutationBatch({ map });
    await expectAsync(batch.run([], draft => { void draft.map; }))
      .toBeRejectedWithError(/custom own properties/);
    expect(getter).not.toHaveBeenCalled();
  });
  it('carries nested Map and Set member writes into later stages', async () => {
    const mapMember = { n: 1 };
    const setMember = { n: 10 };
    const state = { map: new Map([['u', mapMember]]), set: new Set([setMember]) };
    const batch = new MutationBatch(state);
    await batch.run([], draft => {
      draft.map.get('u').n++;
      [...draft.set][0].n++;
    });
    await batch.run([], draft => {
      expect(draft.map.get('u').n).toBe(2);
      expect([...draft.set][0].n).toBe(11);
      draft.map.get('u').n++;
      [...draft.set][0].n++;
    });
    expect(mapMember.n).toBe(1);
    expect(setMember.n).toBe(10);
    batch.commit();
    expect(state.map.get('u')).toBe(mapMember);
    expect([...state.set][0]).toBe(setMember);
    expect(mapMember.n).toBe(3);
    expect(setMember.n).toBe(12);
  });

  it('rolls back failed nested member writes while retaining successful stages', async () => {
    const state = {
      map: new Map([['u', { n: 1 }]]),
      set: new Set([{ n: 10 }]),
    };
    const batch = new MutationBatch(state);
    await batch.run([], draft => {
      draft.map.get('u').n++;
      [...draft.set][0].n++;
    });
    await expectAsync(batch.run([], draft => {
      draft.map.get('u').n = 100;
      [...draft.set][0].n = 100;
      draft.map.set('extra', { n: 99 });
      draft.set.add({ n: 99 });
      throw new Error('discard stage');
    })).toBeRejectedWithError('discard stage');
    await batch.run([], draft => {
      expect(draft.map.get('u').n).toBe(2);
      expect([...draft.set][0].n).toBe(11);
      expect(draft.map.size).toBe(1);
      expect(draft.set.size).toBe(1);
      draft.map.get('u').n++;
      [...draft.set][0].n++;
    });
    batch.commit();
    expect(state.map.get('u')!.n).toBe(3);
    expect([...state.set][0].n).toBe(12);
    expect(state.map.size).toBe(1);
    expect(state.set.size).toBe(1);
  });

  it('keeps staged object-valued Map keys addressable with their original identity', async () => {
    const key = { id: 1 };
    const value = { n: 1 };
    const state = { map: new Map([[key, value]]) };
    const batch = new MutationBatch(state);
    await batch.run([], draft => {
      [...draft.map.keys()][0].id = 2;
      draft.map.get(key).n++;
    });
    await batch.run([], draft => {
      expect([...draft.map.keys()][0].id).toBe(2);
      expect(draft.map.has(key)).toBeTrue();
      expect(draft.map.get(key).n).toBe(2);
      draft.map.get(key).n++;
    });
    batch.commit();
    expect([...state.map.keys()][0]).toBe(key);
    expect(state.map.get(key)).toBe(value);
    expect(key.id).toBe(2);
    expect(value.n).toBe(3);
  });

  for (const collection of ['Map', 'Set']) {
    it(`strips nested draft proxies from replacement ${collection} values`, async () => {
      const original = { n: 1 };
      const state: any = { source: original };
      const batch = new MutationBatch(state);
      await batch.run([], draft => {
        const inner = new Set([draft.source]);
        draft.result = collection === 'Map' ? new Map([['nested', inner]]) : new Set([inner]);
        delete draft.source;
      });
      batch.commit();
      const inner = collection === 'Map' ? state.result.get('nested') : [...state.result][0];
      const result = [...inner][0];
      expect(result).toBe(original);
      expect(() => (result as any).n).not.toThrow();
      expect((result as any).n).toBe(1);
    });
  }

  it('finalizes collection replacements returned directly by a reducer', async () => {
    const original = { n: 1 };
    const batch = new MutationBatch({ source: original });
    await batch.run([], draft => ({ result: new Map([[draft.source, new Date(0)]]) }));
    const state = batch.commit();
    const key = [...state.result.keys()][0];
    expect(key).toBe(original);
    expect(() => key.n).not.toThrow();
    expect(state.result.get(original).getTime()).toBe(0);
  });

  it('strips draft proxies from collections inserted through collection methods', async () => {
    const original = { n: 1 };
    const state: any = { source: original, map: new Map(), set: new Set() };
    const batch = new MutationBatch(state);
    await batch.run([], draft => {
      draft.map.set('nested', new Set([draft.source]));
      delete draft.source;
    });
    await batch.run([], draft => {
      expect([...draft.map.get('nested')][0].n).toBe(1);
      [...draft.map.get('nested')][0].n++;
    });
    batch.commit();
    expect([...state.map.get('nested')][0]).toBe(original);
    expect(original.n).toBe(2);
  });

  it('journals Date resets against the preceding shadow timestamp', async () => {
    const original = new Date(0);
    const batch = new MutationBatch({ date: original });
    await batch.run([], draft => {
      draft.date.setTime(100);
      draft.date.setTime(0);
      expect(draft.date.getTime()).toBe(0);
    });
    batch.commit();
    expect(original.getTime()).toBe(0);
  });

  it('preserves Date resets across stages and discards failed Date setters', async () => {
    const original = new Date(0);
    const batch = new MutationBatch({ date: original });
    await batch.run([], draft => { draft.date.setTime(100); });
    await expectAsync(batch.run([], draft => {
      draft.date.setTime(200);
      throw new Error('discard time');
    })).toBeRejectedWithError('discard time');
    await batch.run([], draft => {
      expect(draft.date.getTime()).toBe(100);
      draft.date.setTime(0);
    });
    batch.commit();
    expect(original.getTime()).toBe(0);
  });

  it('suppresses unchanged Date setters after an earlier change', async () => {
    const batch = new MutationBatch({ date: new Date(0) });
    await batch.run([], draft => {
      draft.date.setTime(100);
      draft.date.setTime(100);
      draft.date.setUTCMilliseconds(100);
    });
    expect(batch.changes).toEqual([['date']]);
    batch.commit();
  });

  it('treats an unchanged invalid Date as a no-op', async () => {
    const original = new Date(NaN);
    const batch = new MutationBatch({ date: original });
    await batch.run([], draft => { draft.date.setTime(NaN); });
    expect(batch.changes).toEqual([]);
    batch.commit();
    expect(Number.isNaN(original.getTime())).toBeTrue();
  });

  it('rejects cycles through Map keys, Map values, and Set members', () => {
    const keyCycle = new Map(); keyCycle.set(keyCycle, 1);
    const valueCycle = new Map(); valueCycle.set('self', valueCycle);
    const setCycle = new Set(); setCycle.add(setCycle);
    expect(() => validateTree({ keyCycle })).toThrowError(/tree/);
    expect(() => validateTree({ valueCycle })).toThrowError(/tree/);
    expect(() => validateTree({ setCycle })).toThrowError(/tree/);
  });

  it('rejects shared references across collection contents and object properties', () => {
    const item = {};
    expect(() => validateTree({ map: new Map([['u', item]]), item })).toThrowError(/tree/);
    expect(() => validateTree({ set: new Set([item]), item })).toThrowError(/tree/);
    expect(() => validateTree({ map: new Map([[item, 1]]), item })).toThrowError(/tree/);
    expect(() => validateTree({ map: new Map([[item, item]]) })).toThrowError(/tree/);
  });

  it('validates pending collection entries and rolls back an invalid stage', async () => {
    const state = { map: new Map<string, any>() };
    const batch = new MutationBatch(state);
    await expectAsync(batch.run([], draft => { draft.map.set('self', draft.map); }))
      .toBeRejectedWithError(/tree/);
    await batch.run([], draft => {
      expect(draft.map.size).toBe(0);
      draft.map.set('valid', { n: 1 });
    });
    batch.commit();
    expect([...state.map.keys()]).toEqual(['valid']);
  });

  it('revokes extracted Map, Set, and Date methods after a successful stage', async () => {
    const methods: (() => any)[] = [];
    const batch = new MutationBatch({ map: new Map([['a', 1]]), set: new Set([1]), date: new Date(0) });
    await batch.run([], draft => {
      const get = draft.map.get;
      const set = draft.map.set;
      const has = draft.set.has;
      const add = draft.set.add;
      const getTime = draft.date.getTime;
      const setTime = draft.date.setTime;
      methods.push(() => get('a'), () => set('b', 2), () => has(1), () => add(2), getTime, () => setTime(100));
    });
    for (const method of methods) expect(method).toThrow();
  });

  it('revokes extracted methods after a failed stage without contaminating later stages', async () => {
    let set!: (key: string, value: number) => any;
    const state = { map: new Map<string, number>() };
    const batch = new MutationBatch(state);
    await expectAsync(batch.run([], draft => {
      set = draft.map.set;
      throw new Error('discard');
    })).toBeRejectedWithError('discard');
    expect(() => set('late', 1)).toThrow();
    await batch.run([], draft => { expect(draft.map.size).toBe(0); });
    batch.commit();
    expect(state.map.size).toBe(0);
  });

  it('revokes retained collection iterators and extracted next methods', async () => {
    let mapIterator!: Iterator<any>;
    let setIterator!: Iterator<any>;
    let next!: () => IteratorResult<any>;
    const batch = new MutationBatch({ map: new Map([['a', 1]]), set: new Set([1]) });
    await batch.run([], draft => {
      mapIterator = draft.map.entries();
      setIterator = draft.set.values();
      next = mapIterator.next.bind(mapIterator);
    });
    expect(() => mapIterator.next()).toThrow();
    expect(() => setIterator.next()).toThrow();
    expect(next).toThrow();
  });
});
