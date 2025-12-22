import type { Tracker } from "@actioncrew/actionstack";
import { createBehaviorSubject } from "@actioncrew/streamix";
import type { BehaviorSubject, Subscription } from "@actioncrew/streamix";
import {
  enableTracing as enableStreamixTracing,
  ValueTracer
} from "@actioncrew/streamix/tracing";
import { CancelablePromise } from "./promise";

type SubscriptionEntry = {
  status$: BehaviorSubject<boolean>;
  status: boolean;
};

/**
 * Creates a new Tracker.
 *
 * Behavior:
 * - Auto-enables Streamix tracing on first `track()`.
 * - Subscribes to ValueTracer events to signal subscriptions.
 * - `waitAll()` is serialized using an internal promise queue.
 * - `waitAll()` returns a CancelablePromise that can be cancelled.
 * - `waitAll()` resolves when all known traces are terminal:
 *   delivered / filtered / collapsed / errored.
 */
export const createTracker = (): Tracker & { cancelAll: () => void } => {
  const subscriptions = new Map<Subscription, SubscriptionEntry>();
  const timeout = 30_000;

  // Serialize waitAll calls.
  let waitQueue: Promise<void> = Promise.resolve();
  
  // Track active wait operations for cancellation
  const activeWaits = new Set<CancelablePromise<void>>();

  // Tracing integration (test-scoped).
  let tracer: ValueTracer | null = null;
  let tracingEnabled = false;
  let tracerUnsubscribe: (() => void) | null = null;

  const state: Tracker["state"] = (subscription) =>
    subscriptions.get(subscription)?.status ?? false;

  const signal: Tracker["signal"] = (subscription) => {
    const entry = subscriptions.get(subscription);
    if (!entry) return;
    entry.status = true;
    entry.status$.next(true);
  };

  const complete: Tracker["complete"] = (subscription) => {
    const entry = subscriptions.get(subscription);
    if (!entry) return;

    entry.status = false;
    entry.status$.complete();
    subscriptions.delete(subscription);
  };

  const track: Tracker["track"] = (subscription) => {
    if (!subscriptions.has(subscription)) {
      subscriptions.set(subscription, {
        status$: createBehaviorSubject<boolean>(false),
        status: false,
      });
    }

    // Enable tracing once we start tracking anything.
    if (!tracingEnabled) {
      tracer = new ValueTracer({ maxTraces: 10_000 });
      enableStreamixTracing(tracer);
      tracingEnabled = true;

      // Subscribe to ValueTracer events to signal subscriptions
      // when values reach terminal states
      tracerUnsubscribe = tracer.subscribe({
        delivered: (trace) => {
          // Signal all subscriptions when a value is delivered
          for (const sub of subscriptions.keys()) {
            signal(sub);
          }
        },
        filtered: (trace) => {
          // Signal all subscriptions when a value is filtered
          for (const sub of subscriptions.keys()) {
            signal(sub);
          }
        },
        collapsed: (trace) => {
          // Signal all subscriptions when a value is collapsed
          for (const sub of subscriptions.keys()) {
            signal(sub);
          }
        },
        dropped: (trace) => {
          // Signal all subscriptions when a value is dropped
          for (const sub of subscriptions.keys()) {
            signal(sub);
          }
        }
      });
    }
  };

  const reset: Tracker["reset"] = () => {
    for (const entry of subscriptions.values()) {
      entry.status = false;
      entry.status$.next(false);
    }
    tracer?.clear();
  };

  /**
   * Returns true if all known traces are in a terminal state.
   */
  const allTracesTerminal = (): boolean => {
    if (!tracer) return true;

    // IMPORTANT:
    // - We consider "emitted" and "processing" as in-flight.
    // - Everything else is terminal for waiting purposes.
    for (const t of tracer.getAllTraces()) {
      if (t.state === "emitted" || t.state === "processing") return false;
    }
    return true;
  };

  /**
   * Waits until tracing indicates there are no in-flight values.
   *
   * Implementation details:
   * - Returns a CancelablePromise that can be cancelled.
   * - Subscribes to tracer events (public API) to avoid polling-only logic.
   * - Also polls at a small interval as a safety net (in case an event is missed).
   * - Ensures proper cleanup of the subscription + timers.
   */
  const waitUsingTracing = (): CancelablePromise<void> => {
    return new CancelablePromise<void>(function* () {
      if (!tracer || !tracingEnabled) {
        // No tracer => nothing to wait for.
        return;
      }

      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let pollId: ReturnType<typeof setInterval> | null = null;
      let unsubscribeFn: any = null;

      try {
        const waitPromise = new Promise<void>((resolve, reject) => {
          timeoutId = setTimeout(() => {
            reject(buildTimeoutError(tracer!));
          }, timeout);

          // Quick exit if already settled.
          if (allTracesTerminal()) {
            resolve();
            return;
          }

          // Event-driven fast path.
          unsubscribeFn = tracer!.subscribe({
            delivered: () => {
              if (allTracesTerminal()) resolve();
            },
            filtered: () => {
              if (allTracesTerminal()) resolve();
            },
            collapsed: () => {
              if (allTracesTerminal()) resolve();
            },
            dropped: () => {
              if (allTracesTerminal()) resolve();
            },
          });

          // Safety net polling.
          pollId = setInterval(() => {
            if (allTracesTerminal()) resolve();
          }, 10);
        });

        yield waitPromise;
        reset();
      } finally {
        // Cleanup
        if (timeoutId !== null) clearTimeout(timeoutId);
        if (pollId !== null) clearInterval(pollId);
        if (unsubscribeFn !== null) unsubscribeFn();
      }
    });
  };

  /**
   * Builds a detailed timeout error showing what is still in-flight.
   */
  const buildTimeoutError = (t: ValueTracer) => {
    const traces = t.getAllTraces();
    const inflight = traces.filter(
      x => x.state === "emitted" || x.state === "processing"
    );

    let msg = `Timeout reached waiting for stream execution (${timeout}ms)\n`;
    msg += `Traces: total=${traces.length}, inflight=${inflight.length}\n`;

    if (inflight.length > 0) {
      msg += `\nStill in-flight (showing up to 5):\n`;
      for (const tr of inflight.slice(0, 5)) {
        const last = tr.operatorSteps.at(-1);
        msg += `- ${tr.valueId} state=${tr.state}`;
        if (last) msg += ` lastOp=${last.operatorName}`;
        msg += `\n`;
      }
      if (inflight.length > 5) {
        msg += `... and ${inflight.length - 5} more\n`;
      }
    }

    return new Error(msg);
  };

  const waitAll = (): CancelablePromise<void> => {
    const cancelableWait = new CancelablePromise<void>(function* () {
      try {
        // Enqueue in the serialization queue
        const queuePromise: Promise<void> = waitQueue.then(async () => {
          // Let initial microtasks enqueue tracing hooks / iterator steps.
          await new Promise<void>(r => queueMicrotask(r));
          
          const innerWait = waitUsingTracing();
          activeWaits.add(innerWait);
          
          try {
            await innerWait;
          } finally {
            activeWaits.delete(innerWait);
          }
        });
        
        yield queuePromise;
      } catch (error) {
        // Don't propagate errors from cancelled operations
        return;
      }
    });

    // Update the queue for the next caller
    waitQueue = cancelableWait.catch(() => {
      // If cancelled or errored, don't propagate to next waiter
    });

    activeWaits.add(cancelableWait);
    cancelableWait.finally(() => {
      activeWaits.delete(cancelableWait);
    });

    return cancelableWait;
  };

  /**
   * Cancel all active wait operations
   */
  const cancelAll = () => {
    for (const wait of activeWaits) {
      wait.cancel();
    }
    activeWaits.clear();
  };

  return {
    timeout,
    state,
    signal,
    complete,
    track,
    reset,
    waitAll,
    cancelAll,
  };
};