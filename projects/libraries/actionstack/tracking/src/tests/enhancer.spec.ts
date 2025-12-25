import { withTracker } from "@epikodelabs/actionstack/tracking";

describe("enhancer", () => {
  it("attaches a tracker and exposes flush()", async () => {
    const enhancer = withTracker();
    const baseCreateStore = () => ({}) as any;
    const store = enhancer(baseCreateStore)({} as any) as any;

    expect(store.tracker).toBeDefined();
    expect(store.flush).toEqual(jasmine.any(Function));

    spyOn(store.tracker, "waitAll").and.resolveTo(undefined as any);
    await store.flush();

    expect(store.tracker.waitAll).toHaveBeenCalled();
  });
});
