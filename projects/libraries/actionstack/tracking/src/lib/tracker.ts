import type { Tracker } from "@actioncrew/actionstack";
import { scheduler, type Subscription } from "@actioncrew/streamix";
import {
  enableTracing,
  ValueTracer
} from "@actioncrew/streamix/tracing";
import { CancelablePromise } from "./promise";

const MAX_TRACES = 10_000;

/**
 * Streamix tracing is effectively global (one active tracer at a time),
 * so this package uses a single shared ValueTracer instance.
 */
let sharedTracer: ValueTracer | null = null;

function getSharedTracer(): ValueTracer {
  sharedTracer ??= new ValueTracer({ maxTraces: MAX_TRACES });
  return sharedTracer;
}

/**
 * Creates a new Tracker.
 *
 * Behavior:
 * - Enables Streamix tracing during `createTracker()` (single global tracer).
 * - `waitAll()` is serialized using an internal promise queue.
 * - `waitAll()` returns a CancelablePromise that can be cancelled.
 * - `waitAll()` resolves when all known traces are terminal:
 *   delivered / filtered / collapsed / errored.
 */
export const createTracker = (): Tracker & { cancelAll: () => void } => {
  const subscriptions = new Map<Subscription, boolean>();
  const timeout = 30_000;

  // Serialize waitAll calls.
  let waitQueue: Promise<void> = Promise.resolve();
  
  // Track active wait operations for cancellation
  const activeWaits = new Set<CancelablePromise<void>>();

  // Tracing integration (test-scoped).
  const tracer = getSharedTracer();
  tracer.clear();
  enableTracing(tracer);

  const state: Tracker["state"] = (subscription) =>
    subscriptions.get(subscription) ?? false;

  const signal: Tracker["signal"] = (subscription) => {
    if (!subscriptions.has(subscription)) return;
    subscriptions.set(subscription, true);
  };

  const complete: Tracker["complete"] = (subscription) => {
    if (!subscriptions.has(subscription)) return;
    subscriptions.delete(subscription);
  };

  const track: Tracker["track"] = (subscription) => {
    if (!subscriptions.has(subscription)) {
      subscriptions.set(subscription, false);
    }
  };

  const reset: Tracker["reset"] = () => {
    for (const sub of subscriptions.keys()) {
      subscriptions.set(sub, false);
    }
    tracer.clear();
  };

  const isInFlight = (state: string) =>
    state === "emitted" || state === "processing" || state === "transformed";

  /**
   * Waits until tracing indicates there are no in-flight values.
   *
   * Implementation details:
   * - Returns a CancelablePromise that can be cancelled.
   * - Uses a simple flush + poll loop to avoid re-entrant tracing deadlocks.
   */
  const waitUsingTracing = (): CancelablePromise<void> => {
    return new CancelablePromise<void>(function* () {
      // Snapshot traces known at the start of this wait.
      yield scheduler.flush();
      const trackedIds = new Set(tracer.getAllTraces().map((t) => t.valueId));

      const allTrackedTerminal = (): boolean => {
        for (const t of tracer.getAllTraces()) {
          if (!trackedIds.has(t.valueId)) continue;
          if (isInFlight(t.state)) {
            return false;
          }
        }
        return true;
      };

      const start = Date.now();
      while (true) {
        // Drive any pending work
        yield scheduler.flush();

        if (allTrackedTerminal()) {
          // One extra flush to deliver callbacks for the tracked traces.
          yield scheduler.flush();
          if (allTrackedTerminal()) break;
        }

        if (Date.now() - start > timeout) {
          throw buildTimeoutError(tracer);
        }

        // Give the runtime a moment before checking again
        yield new Promise<void>((resolve) => setTimeout(resolve, 10));
      }

      // Final flush to deliver any queued callbacks
      yield scheduler.flush();
    });
  };

  /**
   * Builds a detailed timeout error showing what is still in-flight.
   */
  const buildTimeoutError = (t: ValueTracer) => {
    const traces = t.getAllTraces();
    const inflight = traces.filter((x) => isInFlight(x.state));

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

  const enqueueWait = (work: () => Promise<void>) => {
    const run = waitQueue.then(work);
    waitQueue = run.catch(() => {
      // Swallow errors so they don't propagate to next waiter
    });
    return run;
  };

  const waitAll = (): CancelablePromise<void> => {
    // Create the actual work as a regular promise
    let innerWait: CancelablePromise<void> | null = null;
    let canceled = false;
    const work = enqueueWait(async () => {
      if (canceled) return;
      // Let initial microtasks enqueue tracing hooks / iterator steps.
      await new Promise<void>(r => queueMicrotask(r));
      if (canceled) return;
      
      // Do the actual waiting (but convert to regular promise for the queue)
      innerWait = waitUsingTracing();
      
      try {
        // Convert to regular promise to avoid cancellation affecting the queue
        await Promise.resolve(innerWait);
      } finally {
        innerWait = null;
      }
    });

    // Now wrap it in a CancelablePromise for the caller
    const cancelableWait = new CancelablePromise<void>(function* () {
      yield work;
    });

    activeWaits.add(cancelableWait);
    cancelableWait.finally(() => {
      activeWaits.delete(cancelableWait);
    });

    const originalCancel = cancelableWait.cancel.bind(cancelableWait);
    cancelableWait.cancel = () => {
      canceled = true;
      if (innerWait) {
        innerWait.cancel();
      }
      originalCancel();
    };

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
