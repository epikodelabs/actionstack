import { createLock } from "@actioncrew/actionstack";

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

describe("lock", () => {
  it("throws if release() is called without acquire()", () => {
    const lock = createLock();
    expect(() => lock.release()).toThrowError(/not acquired/i);
  });

  it("serializes acquire() calls", async () => {
    const lock = createLock();
    const events: string[] = [];
    const secondAcquired = deferred<void>();

    await lock.acquire();
    events.push("first");

    const p2 = lock.acquire().then(() => {
      events.push("second");
      secondAcquired.resolve();
    });

    await new Promise<void>((r) => setTimeout(r, 0));
    expect(events).toEqual(["first"]);

    lock.release();
    await secondAcquired.promise;
    await p2;
    expect(events).toEqual(["first", "second"]);

    lock.release();
  });
});

