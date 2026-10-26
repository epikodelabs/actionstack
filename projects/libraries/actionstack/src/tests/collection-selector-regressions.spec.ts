import { createSelectorRegistry } from '../lib/tracked-selectors';

describe('collection selector regressions', () => {
  it('keeps collection subclasses opaque rather than invoking their overrides', async () => {
    class CustomMap extends Map<string, number> {
      override get(key: string): number | undefined { throw new Error(`override ${key}`); }
    }
    const map = new CustomMap([['a', 1]]);
    const method = spyOn(map, 'get').and.callThrough();
    const registry = createSelectorRegistry(() => ({ map }));
    spyOn(console, 'warn').and.stub();
    const values: number[] = [];
    const sub = registry.track(s => s.map.get('a'), -1).subscribe(v => values.push(v));
    expect(method).not.toHaveBeenCalled();
    expect(values).toEqual([-1]);
    await sub();
  });
  for (const collection of [new Map(), new Set(), new Date(0)]) {
    it(`blocks descriptor access to raw properties on ${collection.constructor.name}`, async () => {
      const metadata = { n: 0 };
      Object.defineProperty(collection, 'metadata', { value: metadata, configurable: true });
      const registry = createSelectorRegistry(() => ({ collection }));
      const warn = spyOn(console, 'warn').and.stub();
      const values: number[] = [];
      const sub = registry.track(s => {
        const descriptor = Object.getOwnPropertyDescriptor(s.collection, 'metadata');
        descriptor!.value.n++;
        return descriptor!.value.n;
      }, -1).subscribe(v => values.push(v));
      expect(metadata.n).toBe(0);
      expect(values).toEqual([-1]);
      expect(warn).toHaveBeenCalled();
      await sub();
    });
  }

  it('does not execute custom collection getters while selecting', async () => {
    const date = new Date(0);
    const getter = jasmine.createSpy('getter').and.returnValue(1);
    Object.defineProperty(date, 'custom', { get: getter, configurable: true });
    const registry = createSelectorRegistry(() => ({ date }));
    spyOn(console, 'warn').and.stub();
    const values: number[] = [];
    const sub = registry.track(s => s.date.custom, -1).subscribe(v => values.push(v));
    expect(getter).not.toHaveBeenCalled();
    expect(values).toEqual([-1]);
    await sub();
  });

  for (const access of ['get', 'values', 'entries']) {
    it(`re-reads Map members after an await through ${access}`, async () => {
      const state = { map: new Map([['user', { name: 'old' }]]) };
      const registry = createSelectorRegistry(() => state);
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      const reads: string[] = [];
      const results: string[] = [];
      const sub = registry.track(async s => {
        const member = access === 'get' ? s.map.get('user') : access === 'values'
          ? s.map.values().next().value : s.map.entries().next().value[1];
        await gate;
        reads.push(member.name);
        return member.name;
      }).subscribe(v => results.push(v));
      state.map.set('user', { name: 'new' });
      const propagation = registry.notify([['map']]);
      release();
      await propagation;
      await registry.settled();
      expect(reads).toEqual(['new', 'new']);
      expect(results).toEqual(['new']);
      await sub();
    });
  }

  it('strips Map key and Set member proxies from derived collection results', async () => {
    const key = { n: 1 };
    const member = { n: 2 };
    const state = { map: new Map([[key, 'value']]), set: new Set([member]) };
    const registry = createSelectorRegistry(() => state);
    let selected: any;
    const sub = registry.track(s => ({
      keys: new Set(s.map.keys()),
      members: new Map([...s.set].map(item => [item, item.n])),
    })).subscribe(v => { selected = v; });
    expect([...selected.keys][0]).toBe(key);
    expect([...selected.members.keys()][0]).toBe(member);
    await sub();
  });
});
