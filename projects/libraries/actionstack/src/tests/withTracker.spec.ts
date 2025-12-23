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

    const store: any = createStore(enhancer);
    spyOn(store.tracker, "waitAll").and.resolveTo();

    expect(typeof store.flush).toBe("function");

    await store.flush();
    expect(store.tracker.waitAll).toHaveBeenCalled();
  });

  it("wraps select() subscriptions and calls tracker.track()", async () => {
    const enhancer = withTracker();

    const store = createStore<any>(enhancer);
    spyOn(store.tracker, "track").and.stub();
    spyOn(store.tracker, "complete").and.stub();
    await store.dispatch({ type: "TEST/FLUSH" });

    const stream = store.select((s) => (s as any).system?._ready, false);
    const sub = stream.subscribe({ next: () => {} });

    expect(store.tracker.track).toHaveBeenCalled();
    sub.unsubscribe();
  });
});
