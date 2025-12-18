import { createQueue } from "@actioncrew/actionstack";

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

describe("queue", () => {
  it("runs enqueued operations sequentially and tracks pending", async () => {
    const q = createQueue();
    const gate = deferred<void>();
    const events: string[] = [];

    const p1 = q.enqueue(async () => {
      events.push("1-start");
      await gate.promise;
      events.push("1-end");
    });

    const p2 = q.enqueue(async () => {
      events.push("2");
    });

    await new Promise<void>((r) => setTimeout(r, 0));
    expect(events).toEqual(["1-start"]);
    expect(q.pending).toBe(2);
    expect(q.isEmpty).toBeFalse();

    gate.resolve();
    await Promise.all([p1, p2]);

    expect(events).toEqual(["1-start", "1-end", "2"]);
    expect(q.pending).toBe(0);
    expect(q.isEmpty).toBeTrue();
  });

  it("does not lock the queue after a failure", async () => {
    const q = createQueue();
    const events: string[] = [];

    await q.enqueue(async () => {
      throw new Error("boom");
    }).catch(() => {});

    await q.enqueue(() => {
      events.push("after");
    });

    expect(events).toEqual(["after"]);
  });
});

