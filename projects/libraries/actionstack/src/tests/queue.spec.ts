import { createQueue } from "@epikodelabs/actionstack";

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
  it("child enqueues run inline and siblings wait", async () => {
    const q = createQueue();
    const events: string[] = [];

    const p1 = q.enqueue(async () => {
      events.push("A-start");
      await q.enqueue(async () => {
        events.push("child");
      }, { inlineIfRunning: true });
      events.push("A-end");
    });

    const pSibling = q.enqueue(async () => {
      events.push("sibling");
    });

    await Promise.all([p1, pSibling]);

    expect(events).toEqual(["A-start", "child", "A-end", "sibling"]);
  });

  it("keeps siblings queued when an inline child rejects and its parent continues", async () => {
    const q = createQueue();
    const childSettled = deferred<void>();
    const finishParent = deferred<void>();
    const events: string[] = [];
    const failure = new Error("child failed");

    const parent = q.enqueue(async () => {
      try {
        await q.enqueue(() => { throw failure; }, { inlineIfRunning: true });
      } catch (error) {
        expect(error).toBe(failure);
        events.push("child rejected");
      } finally {
        childSettled.resolve();
      }
      await finishParent.promise;
      events.push("parent finished");
    });

    await childSettled.promise;
    const sibling = q.enqueue(() => { events.push("sibling started"); });
    try {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      expect(events).toEqual(["child rejected"]);
    } finally {
      finishParent.resolve();
      await Promise.all([parent, sibling]);
    }

    expect(events).toEqual(["child rejected", "parent finished", "sibling started"]);
  });
  
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

  it("handles synchronous operations", async () => {
    const q = createQueue();
    const events: string[] = [];

    const p1 = q.enqueue(() => {
      events.push("a");
    });
    const p2 = q.enqueue(() => {
      events.push("b");
    });

    expect(q.pending).toBe(2);
    await Promise.all([p1, p2]);
    expect(events).toEqual(["a", "b"]);
    expect(q.pending).toBe(0);
    expect(q.isEmpty).toBeTrue();
  });

  it("does not stall the queue after a failure", async () => {
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

