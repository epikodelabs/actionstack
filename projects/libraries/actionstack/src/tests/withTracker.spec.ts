import { createStore } from "@actioncrew/actionstack";
import { withTracker } from "@actioncrew/actionstack/tracking";

describe("withTracker", () => {
  beforeEach(() => {
    spyOn(console, "log").and.stub();
    spyOn(console, "warn").and.stub();
    spyOn(console, "error").and.stub();
  });

  it("attaches tracker and flush() to the store", async () => {
    const enhancer = withTracker();
    spyOn(enhancer.tracker, "waitAll").and.resolveTo();

    const store: any = createStore(enhancer);

    expect(store.tracker).toBe(enhancer.tracker);
    expect(typeof store.flush).toBe("function");

    await store.flush();
    expect(enhancer.tracker.waitAll).toHaveBeenCalled();
  });

  it("wraps select() subscriptions and calls tracker.track()", async () => {
    const enhancer = withTracker();
    spyOn(enhancer.tracker, "track").and.stub();
    spyOn(enhancer.tracker, "complete").and.stub();

    const store = createStore<any>(enhancer);
    await store.dispatch({ type: "TEST/FLUSH" });

    const stream = store.select((s) => (s as any).system?._ready, false);
    const sub = stream.subscribe({ next: () => {} });

    expect(enhancer.tracker.track).toHaveBeenCalled();
    sub.unsubscribe();
  });
});
