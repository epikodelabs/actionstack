export type TerminalReason = "delivered" | "dropped" | "filtered" | "collapsed" | "errored" | "late";

export interface ValueTrace {
  valueId: string;
  subscriptionId: string;
  emittedAt: number;
  deliveredAt?: number;
  state: TerminalReason | "active";
  sourceValue?: any;
  finalValue?: any;
}

export interface TracerEventHandlers {
  emitted?: (trace: ValueTrace) => void;
  delivered?: (trace: ValueTrace) => void;
  dropped?: (trace: ValueTrace) => void;
  filtered?: (trace: ValueTrace) => void;
  collapsed?: (trace: ValueTrace) => void;
}

export interface TracerSubscriptionEventHandlers {
  emitted?: () => void;
  delivered?: () => void;
  dropped?: () => void;
  filtered?: () => void;
  collapsed?: () => void;
  complete?: () => void;
}

export interface ExtendedValueTracer {
  traces: Map<string, ValueTrace>;
  subscribe(handlers: TracerEventHandlers): () => void;
  observeSubscription(subscriptionId: string, handlers: TracerSubscriptionEventHandlers): () => void;
  completeSubscription(subscriptionId: string): void;
  clear(): void;
}

export interface TerminalTracerOptions {
  maxTraces?: number;
  devMode?: boolean;
  onTraceUpdate?: (trace: ValueTrace) => void;
}

export const createTerminalTracer = (
  options: TerminalTracerOptions = {}
): ExtendedValueTracer => {
  const { onTraceUpdate } = options;
  const traces = new Map<string, ValueTrace>();
  const globalHandlers = new Set<TracerEventHandlers>();
  const subscriptionHandlers = new Map<string, Set<TracerSubscriptionEventHandlers>>();

  const notifySubscription = (
    subscriptionId: string,
    event: keyof TracerSubscriptionEventHandlers
  ) => {
    for (const handlers of subscriptionHandlers.get(subscriptionId) ?? []) {
      handlers[event]?.();
    }
  };

  const notifyGlobal = (event: keyof TracerEventHandlers, trace: ValueTrace) => {
    onTraceUpdate?.(trace);
    for (const handlers of globalHandlers) {
      handlers[event]?.(trace);
    }
  };

  return {
    traces,
    subscribe(handlers: TracerEventHandlers) {
      globalHandlers.add(handlers);
      return () => {
        globalHandlers.delete(handlers);
      };
    },
    observeSubscription(subscriptionId: string, handlers: TracerSubscriptionEventHandlers) {
      const bucket = subscriptionHandlers.get(subscriptionId) ?? new Set<TracerSubscriptionEventHandlers>();
      bucket.add(handlers);
      subscriptionHandlers.set(subscriptionId, bucket);
      return () => {
        bucket.delete(handlers);
        if (bucket.size === 0) {
          subscriptionHandlers.delete(subscriptionId);
        }
      };
    },
    completeSubscription(subscriptionId: string) {
      notifySubscription(subscriptionId, "complete");
    },
    clear() {
      traces.clear();
      globalHandlers.clear();
      subscriptionHandlers.clear();
    },
  };
};
