import {
  buffer,
  createOperator,
  createStream,
  filter,
  map,
  scheduler,
} from "@epikodelabs/streamix";

import { createTracker } from "@epikodelabs/actionstack/tracking";
import { disableTracing } from "@epikodelabs/streamix/tracing";

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
    disableTracing();
    await flush();
  });

  it("resolves immediately when nothing is tracked", async () => {
    const tracker = createTracker();
    await tracker.waitAll();
  });

  it("updates state via signal(), reset(), and complete()", async () => {
    const tracker = createTracker();
    const stream = createStream("test", async function* () {
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
  });

  it("allows tracking the same subscription multiple times", async () => {
    const tracker = createTracker();
    const stream = createStream("test", async function* () {
      yield 1;
    });
    const sub = stream.subscribe({ next: () => {} });

    tracker.track(sub);
    tracker.track(sub);

    await tracker.waitAll();

    tracker.complete(sub);
    sub.unsubscribe();
  });

  it("waits for async values to be delivered", async () => {
    const tracker = createTracker();
    const allowDeliver = deferred<void>();
    const started = deferred<void>();

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

    const stream = createStream("test", async function* () {
      yield 1;
    });

    const received: number[] = [];
    const sub = stream
      .pipe(hold)
      .subscribe({ next: (v) => received.push(v) });
    tracker.track(sub);

    await started.promise;

    const waitPromise = tracker.waitAll();

    await new Promise((r) => setTimeout(r, 10));
    expect(received).toEqual([]);

    allowDeliver.resolve();
    await waitPromise;

    expect(received).toEqual([1]);

    tracker.complete(sub);
    sub.unsubscribe();
  });

  it("resolves when traces are already terminal", async () => {
    const tracker = createTracker();
    const stream = createStream("test", async function* () {
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
    const stream = createStream("test", async function* () {
      yield 1;
      yield 2;
      yield 3;
    });

    const received: number[] = [];
    const sub = stream
      .pipe(map((x) => x * 2))
      .subscribe({ next: (v) => received.push(v) });
    tracker.track(sub);

    await tracker.waitAll();

    expect(received).toEqual([2, 4, 6]);

    tracker.complete(sub);
    sub.unsubscribe();
  });

  it("resolves when values are filtered", async () => {
    const tracker = createTracker();
    const stream = createStream("test", async function* () {
      yield 1;
      yield 2;
      yield 3;
    });

    const received: number[] = [];
    const sub = stream
      .pipe(filter((x) => x > 1))
      .subscribe({ next: (v) => received.push(v) });

    tracker.track(sub);
    await tracker.waitAll();

    expect(received).toEqual([2, 3]);

    tracker.complete(sub);
    sub.unsubscribe();
  });

  it("resolves when values are buffered", async () => {
    const tracker = createTracker();
    const stream = createStream("test", async function* () {
      yield 1;
      yield 2;
      yield 3;
    });

    const received: number[][] = [];
    const sub = stream
      .pipe(buffer(50))
      .subscribe({ next: (v) => received.push(v) });

    tracker.track(sub);
    await tracker.waitAll();

    expect(received).toEqual([[1, 2, 3]]);

    tracker.complete(sub);
    sub.unsubscribe();
  });

  it("resolves when an operator errors", async () => {
    const tracker = createTracker();

    const boom = createOperator<number, number>("boom", (source) => ({
      async next() {
        const r = await source.next();
        if (r.done) return r;
        throw new Error("BOOM");
      },
      return: source.return?.bind(source),
      throw: source.throw?.bind(source),
    }));

    const stream = createStream("test", async function* () {
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

    expect(errorCaught).toBeTrue();

    tracker.complete(sub);
    sub.unsubscribe();
  });

  it("resolves when a subscriber callback throws", async () => {
    const tracker = createTracker();
    const stream = createStream("test", async function* () {
      yield 1;
      yield 2;
      yield 3;
    });

    let errorCaught = false;
    const sub = stream.subscribe({
      next: (v) => {
        if (v === 2) {
          throw new Error("Callback error");
        }
      },
      error: () => {
        errorCaught = true;
      },
    });

    tracker.track(sub);
    await tracker.waitAll();

    expect(errorCaught).toBeTrue();

    tracker.complete(sub);
    sub.unsubscribe();
  });

  it("serializes multiple waitAll calls", async () => {
    const tracker = createTracker();
    const stream = createStream("test", async function* () {
      yield 1;
      yield 2;
      yield 3;
    });
    const sub = stream.pipe(map((x) => x)).subscribe({ next: () => {} });
    tracker.track(sub);

    const order: string[] = [];

    const p1 = tracker.waitAll().then(() => order.push("first"));
    const p2 = tracker.waitAll().then(() => order.push("second"));

    await Promise.all([p1, p2]);

    expect(order).toEqual(["first", "second"]);

    tracker.complete(sub);
    sub.unsubscribe();
  });

  it("can cancel a wait before completion", async () => {
    const tracker = createTracker();
    const allowDeliver = deferred<void>();
    const started = deferred<void>();

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

    const stream = createStream("test", async function* () {
      yield 1;
    });

    const received: number[] = [];
    const sub = stream
      .pipe(hold)
      .subscribe({ next: (v) => received.push(v) });
    tracker.track(sub);

    await started.promise;

    const waitPromise = tracker.waitAll();

    waitPromise.cancel();
    await waitPromise.catch(() => {});

    allowDeliver.resolve();
    await flush();

    tracker.complete(sub);
    sub.unsubscribe();
  });

  it("can cancel multiple concurrent waits", async () => {
    const tracker = createTracker();
    const allowDeliver = deferred<void>();

    const hold = createOperator<number, number>("hold", (source) => ({
      async next() {
        const r = await source.next();
        if (r.done) return r;
        await allowDeliver.promise;
        return r;
      },
      return: source.return?.bind(source),
      throw: source.throw?.bind(source),
    }));

    const stream = createStream("test", async function* () {
      yield 1;
      yield 2;
      yield 3;
    });

    const sub = stream.pipe(hold).subscribe({ next: () => {} });
    tracker.track(sub);

    const waits = [tracker.waitAll(), tracker.waitAll(), tracker.waitAll()];

    waits.forEach((w) => w.cancel());
    await Promise.all(waits.map((w) => w.catch(() => {})));

    allowDeliver.resolve();
    await flush();

    tracker.complete(sub);
    sub.unsubscribe();
  });

  it("cancelAll() cancels all active waits", async () => {
    const tracker = createTracker();
    const allowDeliver = deferred<void>();

    const hold = createOperator<number, number>("hold", (source) => ({
      async next() {
        const r = await source.next();
        if (r.done) return r;
        await allowDeliver.promise;
        return r;
      },
      return: source.return?.bind(source),
      throw: source.throw?.bind(source),
    }));

    const stream = createStream("test", async function* () {
      yield 1;
      yield 2;
    });

    const sub = stream.pipe(hold).subscribe({ next: () => {} });
    tracker.track(sub);

    const waits = [tracker.waitAll(), tracker.waitAll(), tracker.waitAll()];

    tracker.cancelAll();
    await Promise.all(waits.map((w) => w.catch(() => {})));

    allowDeliver.resolve();
    await flush();

    tracker.complete(sub);
    sub.unsubscribe();
  });

  it("cancelled wait does not block subsequent waits", async () => {
    const tracker = createTracker();
    const stream = createStream("test", async function* () {
      yield 1;
      yield 2;
      yield 3;
    });
    const sub = stream.pipe(map((x) => x)).subscribe({ next: () => {} });
    tracker.track(sub);

    const wait1 = tracker.waitAll();
    wait1.cancel();
    await wait1.catch(() => {});

    await tracker.waitAll();

    tracker.complete(sub);
    sub.unsubscribe();
  });

  it("can cancel a wait in the middle of a queue", async () => {
    const tracker = createTracker();
    const allowValue = deferred<void>();
    let deliverCount = 0;

    const hold = createOperator<number, number>("hold", (source) => ({
      async next() {
        const r = await source.next();
        if (r.done) return r;
        deliverCount++;
        // Only the first call blocks
        if (deliverCount === 1) {
          await allowValue.promise;
        }
        return r;
      },
      return: source.return?.bind(source),
      throw: source.throw?.bind(source),
    }));

    const stream = createStream("test", async function* () {
      yield 1;
      yield 2;
      yield 3;
    });

    const sub = stream.pipe(hold).subscribe({ next: () => { } });
    tracker.track(sub);

    // Queue three waits - all waiting for the first value to unblock
    const wait1 = tracker.waitAll();
    const wait2 = tracker.waitAll();
    const wait3 = tracker.waitAll();

    // Cancel the middle wait
    wait2.cancel();

    // Unblock the stream - this allows all values to flow
    allowValue.resolve();
    await flush();

    // wait1 should complete successfully
    await wait1;

    // wait2 was cancelled; the primitive resolves to `undefined` on cancel
    await expectAsync(wait2).toBeResolvedTo(undefined);

    // wait3 should also complete (not be impacted by the canceled middle wait)
    await wait3;

    tracker.complete(sub);
    sub.unsubscribe();
  });

  it("handles multiple cancel calls safely", async () => {
    const tracker = createTracker();
    const stream = createStream("test", async function* () {
      yield 1;
    });
    const sub = stream.subscribe({ next: () => {} });
    tracker.track(sub);

    const wait = tracker.waitAll();

    wait.cancel();
    wait.cancel();
    wait.cancel();

    await wait.catch(() => {});

    tracker.complete(sub);
    sub.unsubscribe();
  });

  it("cancelled promise does not affect tracer state", async () => {
    const tracker = createTracker();
    const stream = createStream("test", async function* () {
      yield 1;
      yield 2;
      yield 3;
    });

    const received: number[] = [];
    const sub = stream
      .pipe(map((x) => x))
      .subscribe({ next: (v) => received.push(v) });
    tracker.track(sub);

    const wait1 = tracker.waitAll();
    wait1.cancel();
    await wait1.catch(() => {});

    await tracker.waitAll();

    expect(received).toEqual([1, 2, 3]);

    tracker.complete(sub);
    sub.unsubscribe();
  });

  it("supports then/catch/finally chaining", async () => {
    const tracker = createTracker();
    const stream = createStream("test", async function* () {
      yield 1;
      yield 2;
    });
    const sub = stream.subscribe({ next: () => {} });
    tracker.track(sub);

    let thenCalled = false;
    let catchCalled = false;
    let finallyCalled = false;

    await tracker
      .waitAll()
      .then(() => {
        thenCalled = true;
      })
      .catch(() => {
        catchCalled = true;
      })
      .finally(() => {
        finallyCalled = true;
      });

    expect(thenCalled).toBeTrue();
    expect(catchCalled).toBeFalse();
    expect(finallyCalled).toBeTrue();

    tracker.complete(sub);
    sub.unsubscribe();
  });

});
