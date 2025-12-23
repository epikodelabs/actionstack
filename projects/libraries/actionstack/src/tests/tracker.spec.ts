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
    disableTracing();
    await flush();
  });

  describe("basic functionality", () => {
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
      tracker.track(sub); // Should be idempotent

      await tracker.waitAll();

      tracker.complete(sub);
      sub.unsubscribe();
    });
  });

  describe("waiting for stream completion", () => {
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

      // Start waiting
      const waitPromise = tracker.waitAll();

      // Give it a moment to ensure we're waiting
      await new Promise((r) => setTimeout(r, 10));
      expect(received).toEqual([]); // Not delivered yet

      // Allow delivery
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

      // Let the stream complete
      await flush();

      // Should resolve immediately
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
  });

  describe("wait queue serialization", () => {
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
  });

  describe("cancellation", () => {
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

      // Cancel immediately
      waitPromise.cancel();
      await waitPromise.catch(() => {});

      // Allow stream to continue
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

      // Cancel all
      waits.forEach((w) => w.cancel());
      await Promise.all(waits.map((w) => w.catch(() => {})));

      // Allow stream to complete
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

      // Cancel all at once
      tracker.cancelAll();
      await Promise.all(waits.map((w) => w.catch(() => {})));

      // Allow stream to complete
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

      // Cancel first wait
      const wait1 = tracker.waitAll();
      wait1.cancel();
      await wait1.catch(() => {});

      // Second wait should complete normally
      await tracker.waitAll();

      tracker.complete(sub);
      sub.unsubscribe();
    });

    it("can cancel a wait in the middle of a queue", async () => {
      const tracker = createTracker();
      const allowFirst = deferred<void>();
      const allowSecond = deferred<void>();

      let callCount = 0;
      const hold = createOperator<number, number>("hold", (source) => ({
        async next() {
          const r = await source.next();
          if (r.done) return r;
          callCount++;
          if (callCount === 1) {
            await allowFirst.promise;
          } else if (callCount === 2) {
            await allowSecond.promise;
          }
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

      const wait1 = tracker.waitAll();
      const wait2 = tracker.waitAll();
      const wait3 = tracker.waitAll();

      // Cancel middle wait
      wait2.cancel();

      // Complete first
      allowFirst.resolve();
      await wait1;

      // Wait2 should be cancelled
      await wait2.catch(() => {});

      // Complete third
      allowSecond.resolve();
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

      // Multiple cancels should be safe
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

      // Cancel first wait
      const wait1 = tracker.waitAll();
      wait1.cancel();
      await wait1.catch(() => {});

      // Second wait should complete normally and values should be delivered
      await tracker.waitAll();

      expect(received).toEqual([1, 2, 3]);

      tracker.complete(sub);
      sub.unsubscribe();
    });
  });

  describe("promise compatibility", () => {
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
});