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

describe("tracker", () => {
  afterEach(async () => {
    // Avoid test leakage
    disableTracing();
    await flush();
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
