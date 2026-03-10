import { createSubscription } from "@epikodelabs/streamix";

import { createTerminalTracer, createTracker } from "@epikodelabs/actionstack/tracking";

describe("tracker", () => {
  it("resolves immediately when nothing is tracked", async () => {
    const tracker = createTracker();
    await tracker.waitAll();
  });

  it("tracks pending work via start() and finish()", async () => {
    const tracker = createTracker();
    const sub = createSubscription();

    tracker.track(sub);
    expect(tracker.state(sub)).toBeFalse();

    tracker.start(sub);
    expect(tracker.state(sub)).toBeTrue();

    tracker.finish(sub);
    expect(tracker.state(sub)).toBeFalse();
  });

  it("reset() clears pending counts without dropping tracked subscriptions", () => {
    const tracker = createTracker();
    const sub = createSubscription();

    tracker.track(sub);
    tracker.start(sub);
    expect(tracker.state(sub)).toBeTrue();

    tracker.reset();
    expect(tracker.state(sub)).toBeFalse();
  });

  it("complete() removes the subscription from tracking", () => {
    const tracker = createTracker();
    const sub = createSubscription();

    tracker.track(sub);
    tracker.start(sub);
    tracker.complete(sub);

    expect(tracker.state(sub)).toBeFalse();
  });

  it("waitAll() waits until pending work is finished", async () => {
    const tracker = createTracker();
    const sub = createSubscription();

    tracker.track(sub);
    tracker.start(sub);

    let resolved = false;
    const wait = tracker.waitAll().then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBeFalse();

    tracker.finish(sub);
    await wait;

    expect(resolved).toBeTrue();
  });

  it("cancelAll() cancels active waits", async () => {
    const tracker = createTracker();
    const sub = createSubscription();

    tracker.track(sub);
    tracker.start(sub);

    const wait1 = tracker.waitAll();
    const wait2 = tracker.waitAll();

    tracker.cancelAll();

    await expectAsync(wait1).toBeResolvedTo(undefined);
    await expectAsync(wait2).toBeResolvedTo(undefined);
  });

  it("accepts a legacy tracer argument without using streamix/tracing", async () => {
    const tracer = createTerminalTracer();
    const tracker = createTracker(tracer);
    const sub = createSubscription();

    tracker.track(sub);
    tracker.signal(sub);
    expect(tracker.state(sub)).toBeTrue();

    tracker.finish(sub);
    await tracker.waitAll();
  });
});
