import "@actioncrew/streamix/tracing"; // IMPORTANT: registers runtime hooks

import {
  buffer,
  createOperator,
  createStream,
  filter,
  map,
  scheduler,
} from "@actioncrew/streamix";

import { createTracker } from "@actioncrew/actionstack/tracking";
import { disableTracing } from "@actioncrew/streamix/tracing";

async function flush(): Promise<void> {
  await scheduler.flush();
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("tracker", () => {
  afterEach(async () => {
    // Avoid test leakage
    disableTracing();
    await flush();
  });

  it("resolves immediately when nothing is tracked", async () => {
    const tracker = createTracker();
    await tracker.waitAll();
    await flush();
  });

  it("updates state via signal(), reset(), and complete()", async () => {
    const tracker = createTracker();

    const stream = createStream("one", async function* () {
      yield 1;
    });

    const sub = stream.subscribe({ next: () => {} });

    tracker.track(sub);
    expect(tracker.state(sub)).toBeFalse();

    tracker.signal(sub);
    expect(tracker.state(sub)).toBeTrue();

    tracker.reset();
    expect(tracker.state(sub)).toBeFalse();

    tracker.complete(sub);
    expect(tracker.state(sub)).toBeFalse();

    sub.unsubscribe();
    await flush();
  });

  it("allows tracking the same subscription multiple times", async () => {
    const tracker = createTracker();

    const stream = createStream("one", async function* () {
      yield 1;
    });

    const sub = stream.subscribe({ next: () => {} });

    tracker.track(sub);
    tracker.track(sub);

    await tracker.waitAll();
    await flush();

    tracker.complete(sub);
    sub.unsubscribe();
  });

  it("waits while a trace is processing, then resolves on delivery", async () => {
    const tracker = createTracker();
    const allowDeliver = deferred<void>();
    const started = deferred<void>();

    // Enable tracing before creating real subscriptions.
    const bootstrap = {} as any;
    tracker.track(bootstrap);

    const hold = createOperator<number, number>("hold", (source) => ({
      async next() {
        const r = await source.next();
        if (r.done) return r;
        started.resolve();
        await allowDeliver.promise;
        return r;
      },
      return: source.return?.bind(source),
      throw: source.throw?.bind(source),
    }));

    const stream = createStream("one", async function* () {
      yield 1;
    });

    const received: number[] = [];
    const sub = stream.pipe(hold).subscribe({ next: (v) => received.push(v) });
    tracker.track(sub);

    await started.promise;

    let resolved = false;
    const p = tracker.waitAll().then(() => {
      resolved = true;
    });

    await new Promise<void>((r) => setTimeout(r, 0));
    expect(resolved).toBeFalse();

    allowDeliver.resolve();
    await p;
    await flush();

    expect(received).toEqual([1]);

    tracker.complete(sub);
    tracker.complete(bootstrap);
    sub.unsubscribe();
  });

  it("resolves quickly when traces are already terminal", async () => {
    const tracker = createTracker();

    const stream = createStream("one", async function* () {
      yield 1;
    });

    const sub = stream.subscribe({ next: () => {} });
    tracker.track(sub);

    await flush();
    await tracker.waitAll();

    tracker.complete(sub);
    sub.unsubscribe();
  });

  it("resolves when values are delivered", async () => {
    const tracker = createTracker();

    const stream = createStream("numbers", async function* () {
      yield 1;
      yield 2;
      yield 3;
    });

    const sub = stream.pipe(map(x => x * 2)).subscribe({ next: () => {} });
    tracker.track(sub);

    await tracker.waitAll();
    await flush();

    tracker.complete(sub);
  });

  it("resolves when values are filtered (no callback for filtered values)", async () => {
    const tracker = createTracker();

    const stream = createStream("numbers", async function* () {
      yield 1;
      yield 2;
      yield 3;
    });

    const received: number[] = [];
    const sub = stream.pipe(filter(x => x > 1)).subscribe({
      next: v => received.push(v),
    });

    tracker.track(sub);

    await tracker.waitAll();
    await flush();

    expect(received).toEqual([2, 3]);

    tracker.complete(sub);
  });

  it("resolves when values are collapsed (buffer)", async () => {
    const tracker = createTracker();

    const stream = createStream("numbers", async function* () {
      yield 1;
      yield 2;
      yield 3;
    });

    const received: number[][] = [];
    const sub = stream.pipe(buffer(50)).subscribe({
      next: v => received.push(v),
    });

    tracker.track(sub);

    await tracker.waitAll();
    await flush();

    expect(received).toEqual([[1, 2, 3]]);

    tracker.complete(sub);
  });

  it("resolves when an operator errors (errored becomes terminal)", async () => {
    const tracker = createTracker();

    const boom = createOperator<number, number>("boom", source => ({
      async next() {
        const r = await source.next();
        if (r.done) return r;
        throw new Error("BOOM");
      },
      return: source.return?.bind(source),
      throw: source.throw?.bind(source),
    }));

    const stream = createStream("numbers", async function* () {
      yield 1;
      yield 2;
    });

    let errorCaught = false;

    const sub = stream.pipe(boom).subscribe({
      error: () => {
        errorCaught = true;
      },
    });

    tracker.track(sub);

    await tracker.waitAll();
    await flush();

    expect(errorCaught).toBeTrue();

    tracker.complete(sub);
  });

  it("queues waitAll calls (second call waits after first completes)", async () => {
    const tracker = createTracker();

    const stream = createStream("numbers", async function* () {
      yield 1;
      yield 2;
      yield 3;
    });

    const sub = stream.pipe(map(x => x)).subscribe({ next: () => {} });
    tracker.track(sub);

    const order: string[] = [];

    const p1 = tracker.waitAll().then(() => order.push("first"));
    const p2 = tracker.waitAll().then(() => order.push("second"));

    await Promise.all([p1, p2]);
    await flush();

    expect(order).toEqual(["first", "second"]);

    tracker.complete(sub);
  });
});
