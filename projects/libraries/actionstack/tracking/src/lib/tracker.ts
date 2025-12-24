import type { Tracker } from "@epikodelabs/actionstack";
import { scheduler, type Subscription } from "@epikodelabs/streamix";
import {
  createValueTracer,
  enableTracing,
  type ValueTracer,
} from "@epikodelabs/streamix/tracing";
import { CancelablePromise } from "./promise";

const MAX_TRACES = 10_000;
const DEFAULT_TIMEOUT = 30_000;

/**
 * Streamix tracing is effectively global (one active tracer at a time),
 * so this package uses a single shared ValueTracer instance.
 */
let sharedTracer: ValueTracer | null = null;

function getSharedTracer(): ValueTracer {
  sharedTracer ??= createValueTracer({ maxTraces: MAX_TRACES });
  return sharedTracer;
}

/**
 * Creates a new Tracker for monitoring stream execution.
 * 
 * The tracker uses Streamix's tracing capabilities to monitor value flow through
 * streams and determine when all tracked operations have completed.
 * 
 * Key behaviors:
 * - Enables global Streamix tracing on creation
 * - `waitAll()` returns a CancelablePromise that resolves when all traces are terminal
 * - Multiple `waitAll()` calls are serialized via an internal queue
 * - Supports cancellation of individual waits or all waits via `cancelAll()`
 * 
 * @returns A tracker instance with wait and cancellation capabilities
 * 
 * @example
 * const tracker = createTracker();
 * const stream = createStream("data", async function*() { yield 1; });
 * const sub = stream.subscribe({ next: console.log });
 * tracker.track(sub);
 * await tracker.waitAll(); // Waits for value to be delivered
 * tracker.complete(sub);
 */
export const createTracker = (): Tracker & { cancelAll: () => void } => {
  const subscriptions = new Map<Subscription, boolean>();
  const timeout = DEFAULT_TIMEOUT;

  // Serialize waitAll calls
  let waitQueue: Promise<void> = Promise.resolve();
  
  // Track active wait operations for cancellation
  const activeWaits = new Set<CancelablePromise<void>>();

  // Initialize global tracer
  const tracer = getSharedTracer();
  tracer.clear();
  enableTracing(tracer);

  /**
   * Gets the signal state of a subscription.
   * 
   * @param subscription - The subscription to check
   * @returns true if the subscription has been signaled, false otherwise
   */
  const state: Tracker["state"] = (subscription) =>
    subscriptions.get(subscription) ?? false;

  /**
   * Signals that a subscription has received a value.
   * 
   * This is typically called from within a stream subscriber's `next` callback.
   * 
   * @param subscription - The subscription to signal
   */
  const signal: Tracker["signal"] = (subscription) => {
    if (!subscriptions.has(subscription)) return;
    subscriptions.set(subscription, true);
  };

  /**
   * Marks a subscription as complete and removes it from tracking.
   * 
   * @param subscription - The subscription to complete
   */
  const complete: Tracker["complete"] = (subscription) => {
    if (!subscriptions.has(subscription)) return;
    subscriptions.delete(subscription);
  };

  /**
   * Adds a subscription to the tracker's monitoring.
   * 
   * @param subscription - The subscription to track
   */
  const track: Tracker["track"] = (subscription) => {
    if (!subscriptions.has(subscription)) {
      subscriptions.set(subscription, false);
    }
  };

  /**
   * Resets all subscription signals and clears the tracer.
   * 
   * This is typically called before dispatching a new action to start
   * fresh tracking for that action's execution.
   */
  const reset: Tracker["reset"] = () => {
    for (const sub of subscriptions.keys()) {
      subscriptions.set(sub, false);
    }
    tracer.clear();
  };

  /**
   * Checks if a trace state indicates in-flight processing.
   * 
   * @param state - The trace state to check
   * @returns true if the trace is still in-flight
   */
  const isInFlight = (state: string): boolean =>
    state === "emitted" || state === "processing" || state === "transformed";

  /**
   * Waits for all tracked traces to reach a terminal state.
   * 
   * Uses a snapshot approach: only waits for traces that exist at the start
   * of the wait. New traces created during the wait are ignored, preventing
   * infinite waiting when subscriptions dispatch more actions.
   * 
   * @returns A CancelablePromise that resolves when all tracked traces are terminal
   */
  const waitUsingTracing = (): CancelablePromise<void> => {
    return new CancelablePromise<void>(function* () {
      // Flush scheduler and snapshot current traces
      yield scheduler.flush();
      const trackedIds = new Set(tracer.getAllTraces().map((t) => t.valueId));

      /**
       * Checks if all traces in the snapshot are terminal.
       */
      const allTrackedTerminal = (): boolean => {
        for (const t of tracer.getAllTraces()) {
          // Only check traces from the snapshot
          if (!trackedIds.has(t.valueId)) continue;
          if (isInFlight(t.state)) {
            return false;
          }
        }
        return true;
      };

      const start = Date.now();
      
      // Poll until all tracked traces are terminal
      while (true) {
        yield scheduler.flush();

        if (allTrackedTerminal()) {
          // Extra flush to ensure subscriber callbacks are delivered
          yield scheduler.flush();
          if (allTrackedTerminal()) break;
        }

        // Timeout check
        if (Date.now() - start > timeout) {
          throw buildTimeoutError(tracer);
        }

        // Brief pause before next check
        yield new Promise<void>((resolve) => setTimeout(resolve, 10));
      }

      // Final flush for any remaining callbacks
      yield scheduler.flush();
    });
  };

  /**
   * Builds a detailed timeout error showing what traces are still in-flight.
   * 
   * @param tracer - The tracer instance
   * @returns An error with diagnostic information
   */
  const buildTimeoutError = (tracer: ValueTracer): Error => {
    const traces = tracer.getAllTraces();
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

  /**
   * Enqueues a wait operation in the serialization queue.
   * 
   * @param work - The async work to enqueue
   * @returns A promise that resolves when the work completes
   */
  const enqueueWait = (work: () => Promise<void>): Promise<void> => {
    const run = waitQueue.then(work);
    // Update queue to point to the new work, swallowing errors
    waitQueue = run.catch(() => {});
    return run;
  };

  /**
   * Waits for all tracked stream operations to complete.
   * 
   * This method:
   * 1. Serializes multiple calls via an internal queue
   * 2. Takes a snapshot of current traces and only waits for those
   * 3. Returns a CancelablePromise that can be cancelled
   * 4. Ignores new traces created during the wait (prevents infinite waiting)
   * 
   * The snapshot approach is critical for avoiding deadlocks when subscriptions
   * dispatch more actions - we only wait for the traces that existed when
   * waitAll() was called.
   * 
   * @returns A CancelablePromise that resolves when tracked traces are terminal
   * 
   * @example
   * const tracker = createTracker();
   * // ... set up streams and tracking ...
   * await tracker.waitAll(); // Waits for current operations
   * // or
   * const wait = tracker.waitAll();
   * wait.cancel(); // Cancel the wait
   */
  const waitAll = (): CancelablePromise<void> => {
    let innerWait: CancelablePromise<void> | null = null;
    let canceled = false;

    // Enqueue the wait work
    const work = enqueueWait(async () => {
      if (canceled) return;
      
      // Let microtasks run to set up tracing hooks
      await new Promise<void>((r) => queueMicrotask(r));
      if (canceled) return;

      // Perform the actual wait
      innerWait = waitUsingTracing();
      
      try {
        await Promise.resolve(innerWait);
      } finally {
        innerWait = null;
      }
    });

    // Wrap in CancelablePromise for the caller
    const cancelableWait = new CancelablePromise<void>(function* () {
      yield work;
    });

    // Track for cancelAll()
    activeWaits.add(cancelableWait);
    cancelableWait.finally(() => {
      activeWaits.delete(cancelableWait);
    });

    // Override cancel to also cancel inner wait
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
   * Cancels all active wait operations.
   * 
   * This is useful for cleanup or when you want to abort all pending waits,
   * for example during application shutdown or test teardown.
   * 
   * @example
   * const tracker = createTracker();
   * const wait1 = tracker.waitAll();
   * const wait2 = tracker.waitAll();
   * tracker.cancelAll(); // Cancels both waits
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

