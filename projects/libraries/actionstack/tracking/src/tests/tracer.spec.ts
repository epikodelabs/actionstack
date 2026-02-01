import { createTerminalTracer } from "@epikodelabs/actionstack/tracking";
import type { ValueTrace } from "@epikodelabs/streamix/tracing";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTrace(tracer: ReturnType<typeof createTerminalTracer>, id: string): ValueTrace {
  const trace = tracer.getAllTraces().find(t => t.valueId === id);
  if (!trace) {
    throw new Error(`Missing trace ${id}`);
  }
  return trace;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createTerminalTracer", () => {
  let tracer: ReturnType<typeof createTerminalTracer>;

  beforeEach(() => {
    tracer = createTerminalTracer();
  });

  describe("basic tracing", () => {
    it("starts a trace for a root value", () => {
      tracer.startTrace("v1", "stream-1", "numbers", "sub-1", 42);

      const trace = getTrace(tracer, "v1");

      expect(trace.valueId).toBe("v1");
      expect(trace.streamId).toBe("stream-1");
      expect(trace.streamName).toBe("numbers");
      expect(trace.subscriptionId).toBe("sub-1");
      expect(trace.sourceValue).toBe(42);
      expect(trace.state).toBe("emitted");
      expect(trace.emittedAt).toBeDefined();
      expect(trace.operatorSteps.length).toBe(0);
    });

    it("does not record operator steps (terminal-only behavior)", () => {
      tracer.startTrace("v1", "s1", "stream", "sub1", 1);

      tracer.enterOperator("v1", 0, "map", 1);
      tracer.exitOperator("v1", 0, 2, false, "transformed");

      const trace = getTrace(tracer, "v1");

      expect(trace.operatorSteps.length).toBe(0);
      expect(trace.operatorDurations.size).toBe(0);
    });
  });

  describe("value states", () => {
    it("marks a value as filtered", () => {
      tracer.startTrace("v1", "s1", "stream", "sub1", 1);

      tracer.exitOperator("v1", 0, 1, true, "filtered");

      const trace = getTrace(tracer, "v1");

      expect(trace.state).toBe("filtered");
      expect(trace.droppedReason?.reason).toBe("filtered");
      expect(trace.droppedReason?.operatorIndex).toBe(0);
      expect(trace.droppedReason?.operatorName).toBe("op0");
    });

    it("marks a value as transformed", () => {
      tracer.startTrace("v1", "s1", "stream", "sub1", 1);

      tracer.exitOperator("v1", 0, 2, false, "transformed");

      const trace = getTrace(tracer, "v1");

      expect(trace.state).toBe("transformed");
      expect(trace.finalValue).toBe(2);
    });

    it("marks a value as delivered", () => {
      let currentTime = 1000;
      spyOn(Date, 'now').and.callFake(() => currentTime);
      
      tracer.startTrace("v1", "s1", "stream", "sub1", 5);

      currentTime = 1100;
      tracer.markDelivered("v1");

      const trace = getTrace(tracer, "v1");

      expect(trace.state).toBe("delivered");
      expect(trace.deliveredAt).toBe(1100);
      expect(trace.totalDuration).toBe(100);
    });

    it("marks a value as errored", () => {
      const err = new Error("boom");

      tracer.startTrace("v1", "s1", "stream", "sub1", 1);
      tracer.errorInOperator("v1", 0, err);

      const trace = getTrace(tracer, "v1");

      expect(trace.state).toBe("errored");
      expect(trace.droppedReason?.reason).toBe("errored");
      expect(trace.droppedReason?.error).toBe(err);
      expect(trace.droppedReason?.operatorIndex).toBe(0);
    });

    it("marks a value as expanded", () => {
      tracer.startTrace("v1", "s1", "stream", "sub1", 10);

      const v2 = tracer.createExpandedTrace("v1", 0, "expand", 11);

      const t1 = getTrace(tracer, "v1");
      const t2 = getTrace(tracer, v2);

      expect(t1.state).toBe("expanded");
      expect(t2.state).toBe("expanded");
      expect(t2.expandedFrom?.baseValueId).toBe("v1");
    });

    it("marks a value as collapsed", () => {
      tracer.startTrace("v1", "s1", "stream", "sub1", 1);
      tracer.startTrace("v2", "s1", "stream", "sub1", 2);

      tracer.collapseValue("v1", 1, "reduce", "v2", 3);

      const collapsed = getTrace(tracer, "v1");

      expect(collapsed.state).toBe("collapsed");
      expect(collapsed.collapsedInto?.targetValueId).toBe("v2");
    });
  });

  describe("expansion relationships", () => {
    it("records expansion relationships without mutating source values", () => {
      tracer.startTrace("v1", "s1", "stream", "sub1", 10);

      const v2 = tracer.createExpandedTrace("v1", 0, "expand", 11);
      const v3 = tracer.createExpandedTrace("v1", 0, "expand", 12);

      const t1 = getTrace(tracer, "v1");
      const t2 = getTrace(tracer, v2);
      const t3 = getTrace(tracer, v3);

      expect(t1.state).toBe("expanded");
      expect(t1.expandedFrom).toBeUndefined();
      
      expect(t2.state).toBe("expanded");
      expect(t2.expandedFrom?.baseValueId).toBe("v1");
      expect(t2.expandedFrom?.operatorName).toBe("expand");
      expect(t2.expandedFrom?.operatorIndex).toBe(0);
      
      expect(t3.state).toBe("expanded");
      expect(t3.expandedFrom?.baseValueId).toBe("v1");
      expect(t3.expandedFrom?.operatorName).toBe("expand");
      expect(t3.expandedFrom?.operatorIndex).toBe(0);

      expect(t2.sourceValue).toBe(10);
      expect(t3.sourceValue).toBe(10);
      expect(t1.sourceValue).toBe(10);

      expect(t2.finalValue).toBe(11);
      expect(t3.finalValue).toBe(12);
    });

    it("handles expansion from non-existent base trace", () => {
      const v2 = tracer.createExpandedTrace("non-existent", 0, "expand", 11);

      const trace = getTrace(tracer, v2);

      expect(trace.expandedFrom?.baseValueId).toBe("non-existent");
      expect(trace.expandedFrom?.operatorName).toBe("expand");
      expect(trace.streamId).toBe("unknown");
      expect(trace.subscriptionId).toBe("unknown");
    });
  });

  describe("collapse relationships", () => {
    it("records collapse relationships", () => {
      tracer.startTrace("v1", "s1", "stream", "sub1", 1);
      tracer.startTrace("v2", "s1", "stream", "sub1", 2);

      tracer.collapseValue("v1", 1, "reduce", "v2", 3);

      const collapsed = getTrace(tracer, "v1");
      const target = getTrace(tracer, "v2");

      expect(collapsed.state).toBe("collapsed");
      expect(collapsed.collapsedInto?.targetValueId).toBe("v2");
      expect(collapsed.collapsedInto?.operatorName).toBe("reduce");
      expect(collapsed.collapsedInto?.operatorIndex).toBe(1);
      
      expect(collapsed.droppedReason?.reason).toBe("collapsed");
      expect(target.state).toBe("emitted");
    });

    it("does not collapse non-existent traces", () => {
      expect(() => {
        tracer.collapseValue("non-existent", 0, "reduce", "v2");
      }).not.toThrow();
    });
  });

  describe("subscription lifecycle", () => {
    it("completes a subscription without mutating trace state", () => {
      const deliveredHandler = jasmine.createSpy('deliveredHandler');
      const completeHandler = jasmine.createSpy('completeHandler');
      
      tracer.observeSubscription("sub1", {
        delivered: deliveredHandler,
        complete: completeHandler
      });

      tracer.startTrace("v1", "s1", "stream", "sub1", 5);
      tracer.markDelivered("v1");

      tracer.completeSubscription("sub1");

      const trace = getTrace(tracer, "v1");
      expect(trace.state).toBe("delivered");
      expect(deliveredHandler).toHaveBeenCalledWith(jasmine.objectContaining({
        valueId: "v1",
        state: "delivered"
      }));
      expect(completeHandler).toHaveBeenCalled();
    });

    it("marks values as late when arriving after subscription completion", () => {
      tracer.startTrace("v1", "s1", "stream", "sub1", 5);
      tracer.markDelivered("v1");
      
      tracer.completeSubscription("sub1");

      tracer.startTrace("v2", "s1", "stream", "sub1", 6);

      const trace = getTrace(tracer, "v2");
      expect(trace.state).toBe("dropped");
      expect(trace.droppedReason?.reason).toBe("late");
    });
  });

  describe("edge cases", () => {
    it("correctly handles expansion with operator exit", () => {
      tracer.startTrace("v1", "s1", "stream", "sub1", 10);

      tracer.enterOperator("v1", 0, "expand", 10);
      tracer.exitOperator("v1", 0, 10, false, "expanded");

      const v2 = tracer.createExpandedTrace("v1", 0, "expand", 11);
      const v3 = tracer.createExpandedTrace("v1", 0, "expand", 12);

      const t1 = getTrace(tracer, "v1");
      const t2 = getTrace(tracer, v2);
      const t3 = getTrace(tracer, v3);

      expect(t1.state).toBe("expanded");
      expect(t2.state).toBe("expanded");
      expect(t3.state).toBe("expanded");
      
      expect(t2.expandedFrom?.baseValueId).toBe("v1");
      expect(t3.expandedFrom?.baseValueId).toBe("v1");
      
      expect(t1.sourceValue).toBe(10);
      expect(t2.sourceValue).toBe(10);
      expect(t3.sourceValue).toBe(10);
      
      expect(t2.finalValue).toBe(11);
      expect(t3.finalValue).toBe(12);
    });

    it("distinguishes between transformed and expanded states", () => {
      tracer.startTrace("v1", "s1", "stream", "sub1", 10);
      tracer.exitOperator("v1", 0, 20, false, "transformed");
      
      tracer.startTrace("v2", "s1", "stream", "sub1", 30);
      const v3 = tracer.createExpandedTrace("v2", 1, "expand", 31);
      
      const t1 = getTrace(tracer, "v1");
      const t2 = getTrace(tracer, "v2");
      const t3 = getTrace(tracer, v3);
      
      expect(t1.state).toBe("transformed");
      expect(t2.state).toBe("expanded");
      expect(t3.state).toBe("expanded");
    });

    it("handles multiple expansions from same base", () => {
      tracer.startTrace("v1", "s1", "stream", "sub1", 10);
      
      const v2 = tracer.createExpandedTrace("v1", 0, "expand", 11);
      const v3 = tracer.createExpandedTrace("v1", 0, "expand", 12);
      const v4 = tracer.createExpandedTrace("v1", 0, "expand", 13);

      const t1 = getTrace(tracer, "v1");
      
      expect(t1.state).toBe("expanded");
      expect(tracer.getAllTraces().length).toBe(4);
    });
  });

  describe("memory management", () => {
    it("respects maxTraces limit with LRU eviction", () => {
      const limitedTracer = createTerminalTracer({ maxTraces: 2 });
      
      limitedTracer.startTrace("v1", "s1", "stream", "sub1", 1);
      limitedTracer.startTrace("v2", "s1", "stream", "sub1", 2);
      limitedTracer.startTrace("v3", "s1", "stream", "sub1", 3);

      const traces = limitedTracer.getAllTraces();
      expect(traces.length).toBe(2);
      
      const traceIds = traces.map(t => t.valueId);
      expect(traceIds).toContain("v2");
      expect(traceIds).toContain("v3");
      expect(traceIds).not.toContain("v1");
    });

    it("clears all traces", () => {
      tracer.startTrace("v1", "s1", "stream", "sub1", 1);
      tracer.startTrace("v2", "s1", "stream", "sub1", 2);
      
      expect(tracer.getAllTraces().length).toBe(2);
      
      tracer.clear();
      
      expect(tracer.getAllTraces().length).toBe(0);
      expect(tracer.getStats().total).toBe(0);
    });
  });

  describe("event subscriptions", () => {
    it("notifies global subscribers of delivered events", () => {
      const deliveredHandler = jasmine.createSpy('deliveredHandler');
      const filteredHandler = jasmine.createSpy('filteredHandler');
      
      tracer.subscribe({
        delivered: deliveredHandler,
        filtered: filteredHandler
      });

      tracer.startTrace("v1", "s1", "stream", "sub1", 1);
      tracer.markDelivered("v1");

      expect(deliveredHandler).toHaveBeenCalledWith(jasmine.objectContaining({
        valueId: "v1",
        state: "delivered"
      }));
      expect(filteredHandler).not.toHaveBeenCalled();
    });

    it("notifies subscription-specific subscribers", () => {
      const sub1Handler = jasmine.createSpy('sub1Handler');
      const sub2Handler = jasmine.createSpy('sub2Handler');
      
      tracer.observeSubscription("sub1", { delivered: sub1Handler });
      tracer.observeSubscription("sub2", { delivered: sub2Handler });

      tracer.startTrace("v1", "s1", "stream", "sub1", 1);
      tracer.markDelivered("v1");

      expect(sub1Handler).toHaveBeenCalled();
      expect(sub2Handler).not.toHaveBeenCalled();
    });

    it("allows unsubscribing from events", () => {
      const handler = jasmine.createSpy('handler');
      
      const unsubscribe = tracer.subscribe({ delivered: handler });
      
      tracer.startTrace("v1", "s1", "stream", "sub1", 1);
      tracer.markDelivered("v1");
      
      expect(handler).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      
      tracer.startTrace("v2", "s1", "stream", "sub1", 2);
      tracer.markDelivered("v2");
      
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("trace statistics", () => {
    it("returns correct stats", () => {
      expect(tracer.getStats()).toEqual({ total: 0 });
      
      tracer.startTrace("v1", "s1", "stream", "sub1", 1);
      tracer.startTrace("v2", "s1", "stream", "sub1", 2);
      
      expect(tracer.getStats()).toEqual({ total: 2 });
      
      tracer.clear();
      
      expect(tracer.getStats()).toEqual({ total: 0 });
    });
  });
});