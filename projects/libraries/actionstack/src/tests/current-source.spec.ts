import { createSubscription } from '@epikodelabs/streamix';
import { createCurrentSource, type CurrentValue } from '../lib/current-source';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('current source readiness and connection lifecycle', () => {
  it('delivers an equal async result to a joining subscriber without duplicating existing deliveries', async () => {
    let emit!: (candidate: CurrentValue<number>) => void;
    const source = createCurrentSource<number>({ connect: next => { emit = next; next(1); } });
    const a: number[] = [];
    const b: number[] = [];
    const first = source.subscribe(value => a.push(value));
    const gate = deferred<number>();
    emit(gate.promise);
    const second = source.subscribe(value => b.push(value));
    expect(a).toEqual([1]);
    expect(b).toEqual([]);
    gate.resolve(1);
    await settle();
    expect(a).toEqual([1]);
    expect(b).toEqual([1]);
    await first(); await second();
  });

  it('delivers an unchanged initial selection after disconnect and reconnect', async () => {
    let current: number | Promise<number> = 7;
    const source = createCurrentSource<number>({ read: () => current });
    const first = source.subscribe(() => {});
    await first();
    const gate = deferred<number>();
    current = gate.promise;
    const values: number[] = [];
    const second = source.subscribe(value => values.push(value));
    expect(values).toEqual([]);
    gate.resolve(7);
    await settle();
    expect(values).toEqual([7]);
    await second();
  });

  it('removes pending subscribers synchronously without leaking duplicate delivery', async () => {
    let emit!: (candidate: CurrentValue<number>) => void;
    const source = createCurrentSource<number>({ connect: next => { emit = next; next(1); } });
    const a: number[] = [];
    const b: number[] = [];
    const first = source.subscribe(value => a.push(value));
    const gate = deferred<number>();
    emit(gate.promise);
    const second = source.subscribe(value => b.push(value));
    const cleanup = second();
    gate.resolve(1);
    await cleanup; await settle();
    emit(1);
    expect(a).toEqual([1]);
    expect(b).toEqual([]);
    await first();
  });

  it('ignores both resolved promises and new emissions from obsolete connections', async () => {
    const emissions: ((candidate: CurrentValue<number>) => void)[] = [];
    const source = createCurrentSource<number>({
      connect: emit => {
        emissions.push(emit);
        return createSubscription(() => {});
      },
    });
    const first = source.subscribe(() => {});
    const old = deferred<number>();
    emissions[0](old.promise);
    const cleanup = first();
    const values: number[] = [];
    const second = source.subscribe(value => values.push(value));
    emissions[1](2);
    emissions[0](3);
    old.resolve(4);
    await cleanup; await settle();
    expect(values).toEqual([2]);
    await second();
  });

  it('keeps one connection when an initial subscriber attaches another subscriber', async () => {
    let reads = 0;
    const source = createCurrentSource<number>({ read: () => ++reads });
    const values: number[] = [];
    let nested: (() => any) | undefined;
    const first = source.subscribe(() => {
      nested ??= source.subscribe(value => values.push(value));
    });
    expect(reads).toBe(1);
    expect(values).toEqual([1]);
    await first(); await nested?.();
  });

  it('cleans up a connection disposed before connect returns its teardown', () => {
    const cleanup = jasmine.createSpy('cleanup');
    const source = createCurrentSource<number>({
      connect: emit => {
        emit(1);
        source.dispose();
        return createSubscription(cleanup);
      },
    });
    const sub = source.subscribe(() => {});
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(source.disposed).toBeTrue();
    void sub();
  });

  it('serializes async subscriber callbacks through the atom delivery queue', async () => {
    let emit!: (candidate: CurrentValue<number>) => void;
    const source = createCurrentSource<number>({ connect: next => { emit = next; next(1); } });
    const gate = deferred<void>();
    const events: string[] = [];
    const sub = source.subscribe(async value => {
      events.push(`start:${value}`);
      if (value === 1) await gate.promise;
      events.push(`end:${value}`);
    });
    emit(2); emit(3);
    expect(events).toEqual(['start:1']);
    gate.resolve(); await settle();
    expect(events).toEqual(['start:1', 'end:1', 'start:2', 'end:2', 'start:3', 'end:3']);
    await sub();
  });
});
