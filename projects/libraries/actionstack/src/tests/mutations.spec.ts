import { MutationBatch, validateTree } from '../lib/mutations';

describe('mutation transactions', () => {
  it('preflights immutable targets before applying any part of a commit', async () => {
    const state: any = { n: 0, items: [1, 2] };
    Object.defineProperty(state.items, '1', { configurable: false });
    const batch = new MutationBatch(state);
    await batch.run([], draft => { draft.n++; draft.items.length = 0; });
    expect(() => batch.commit()).toThrowError(/non-configurable/);
    expect(state.n).toBe(0);
    expect(state.items).toEqual([1, 2]);
  });

  it('rejects aliases to previously modified committed objects across stages', async () => {
    const state: any = { a: { n: 1 } };
    const batch = new MutationBatch(state);
    await batch.run([], draft => { draft.a.n++; });
    await expectAsync(batch.run([], draft => { draft.b = state.a; })).toBeRejectedWithError(/tree/);
    batch.commit();
    expect(state.a.n).toBe(2);
    expect(Object.hasOwn(state, 'b')).toBeFalse();
  });
  it('stages nested writes and commits in place, revoking every draft', async () => {
    const state = { user: { name: 'old' }, count: 0 };
    const user = state.user;
    let retained: any;
    const batch = new MutationBatch(state);
    await batch.run([], draft => {
      retained = draft.user;
      draft.user.name = 'new';
      draft.count = 10;
      draft.count++;
      expect(draft.count).toBe(11);
      expect(state.user.name).toBe('old');
    });
    expect(() => retained.name).toThrow();
    expect(batch.commit()).toBe(state);
    expect(state.user).toBe(user);
    expect(state).toEqual({ user: { name: 'new' }, count: 11 });
  });

  it('keeps successful stages and rolls back a failing stage', async () => {
    const state = { slice: { count: 0 } };
    const batch = new MutationBatch(state);
    await batch.run(['slice'], draft => { draft.count++; });
    await expectAsync(batch.run([], draft => {
      expect(draft.slice.count).toBe(1);
      draft.slice.count = 100;
      throw new Error('failed');
    })).toBeRejectedWithError('failed');
    await batch.run([], draft => { draft.slice.count++; });
    batch.commit();
    expect(state.slice.count).toBe(2);
  });

  it('rejects mixed returns and preserves replacements containing draft references', async () => {
    const state = { child: { value: 1 } };
    const bad = new MutationBatch(state);
    await expectAsync(bad.run([], draft => {
      draft.child.value++;
      return {};
    })).toBeRejectedWithError(/both mutate/);
    expect(state.child.value).toBe(1);
    const good = new MutationBatch(state);
    await good.run([], draft => ({ child: draft.child, added: true }));
    const result = good.commit();
    expect(result).not.toBe(state);
    expect(result.child).toBe(state.child);
    expect(result.added).toBeTrue();
  });

  for (const operation of ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'copyWithin', 'fill']) {
    it(`captures array ${operation} with one array invalidation boundary`, async () => {
      const state = { items: [3, 1, 2] };
      const reference = state.items;
      const expected = [3, 1, 2];
      const args: Record<string, any[]> = {
        push: [4], pop: [], shift: [], unshift: [0], splice: [1, 1, 9],
        sort: [], reverse: [], copyWithin: [0, 1], fill: [7, 1],
      };
      (expected as any)[operation](...args[operation]);
      const batch = new MutationBatch(state);
      await batch.run([], draft => { draft.items[operation](...args[operation]); });
      expect(state.items).toEqual([3, 1, 2]);
      expect(batch.changes.every(path => path.length === 1 && path[0] === 'items')).toBeTrue();
      batch.commit();
      expect(state.items).toBe(reference);
      expect(state.items).toEqual(expected);
    });
  }

  it('handles moving object elements after modifying their fields', async () => {
    const first = { n: 1 };
    const second = { n: 2 };
    const state = { items: [first, second] };
    const batch = new MutationBatch(state);
    await batch.run([], draft => {
      draft.items[0].n = 3;
      draft.items.reverse();
      draft.items[0].n = 4;
    });
    batch.commit();
    expect(state.items).toEqual([{ n: 4 }, { n: 3 }]);
    expect(state.items[0]).toBe(second);
    expect(state.items[1]).toBe(first);
  });

  it('preserves holes, truncation, property existence, and explicit undefined', async () => {
    const state: any = { items: [1, 2, 3], value: undefined };
    const batch = new MutationBatch(state);
    await batch.run([], draft => {
      delete draft.items[1];
      draft.items[5] = undefined;
      draft.items.length = 4;
      delete draft.value;
      draft.added = undefined;
    });
    batch.commit();
    expect(state.items.length).toBe(4);
    expect(1 in state.items).toBeFalse();
    expect(3 in state.items).toBeFalse();
    expect(Object.hasOwn(state, 'value')).toBeFalse();
    expect(Object.hasOwn(state, 'added')).toBeTrue();
  });

  it('ignores equal writes and rejects cyclic/shared state', async () => {
    const state = { n: NaN };
    const batch = new MutationBatch(state);
    await batch.run([], draft => { draft.n = NaN; });
    expect(batch.changes).toEqual([]);
    const shared = {};
    expect(() => validateTree({ a: shared, b: shared })).toThrowError(/tree/);
    const cyclic: any = {}; cyclic.self = cyclic;
    expect(() => validateTree(cyclic)).toThrowError(/tree/);
  });

  it('blocks opaque mutation but permits replacing opaque values', async () => {
    class Secret { constructor(public n: number) {} }
    const state = { secret: new Secret(1) };
    const batch = new MutationBatch(state);
    await expectAsync(batch.run([], draft => { draft.secret.n = 2; })).toBeRejectedWithError(/replace the whole value/);
    expect(state.secret.n).toBe(1);
    await batch.run([], draft => { draft.secret = new Secret(3); });
    batch.commit();
    expect(state.secret.n).toBe(3);
  });
});
