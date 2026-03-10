import { createTerminalTracer } from "@epikodelabs/actionstack/tracking";

describe("createTerminalTracer", () => {
  it("supports subscribing and unsubscribing global handlers", () => {
    const tracer = createTerminalTracer();
    const emitted = jasmine.createSpy("emitted");

    const unsubscribe = tracer.subscribe({ emitted });
    unsubscribe();

    expect(emitted).not.toHaveBeenCalled();
  });

  it("supports subscription observers and completion callbacks", () => {
    const tracer = createTerminalTracer();
    const complete = jasmine.createSpy("complete");

    tracer.observeSubscription("sub-1", { complete });
    tracer.completeSubscription("sub-1");

    expect(complete).toHaveBeenCalled();
  });

  it("clears internal state", () => {
    const tracer = createTerminalTracer();
    tracer.traces.set("v1", {
      valueId: "v1",
      subscriptionId: "sub-1",
      emittedAt: Date.now(),
      state: "active",
    });

    tracer.clear();

    expect(tracer.traces.size).toBe(0);
  });
});