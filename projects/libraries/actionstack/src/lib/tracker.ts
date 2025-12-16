import { BehaviorSubject, createBehaviorSubject, Subscription } from "@actioncrew/streamix";
import {
    enableTracing as enableStreamixTracing,
    ValueTracer
} from "@actioncrew/streamix/tracing";

/**
 * Tracker used in tests to wait until all in-flight stream emissions have reached
 * a terminal tracing state.
 *
 * Why tracing?
 * - Some values never reach subscriber callbacks (filtered/collapsed/errored).
 * - Using tracing lets us wait for the *pipeline* to settle, not just callbacks.
 *
 * Notes:
 * - This implementation intentionally does NOT rely on internal/private tracer fields.
 * - It treats the world as "test-scoped": when you call `waitAll()`, it waits until
 *   *all traces currently known by the tracer* are terminal.
 */
export type Tracker = {
  /** Maximum time to wait for the stream graph to settle (ms). */
  timeout: number;

  /** Returns current boolean state for the subscription (if tracked). */
  state: (subscription: Subscription) => boolean;

  /** Signals that a tracked subscription executed some callback work. */
  signal: (subscription: Subscription) => void;

  /** Marks subscription as complete and removes it from the tracker. */
  complete: (subscription: Subscription) => void;

  /** Adds a subscription to tracking (no-op if already tracked). */
  track: (subscription: Subscription) => void;

  /** Resets internal statuses and clears collected traces. */
  reset: () => void;

  /**
   * Waits until tracing shows no in-flight values (no "emitted"/"processing").
   * Calls are queued: each new call waits for the previous waitAll to finish.
   */
  waitAll: () => Promise<void>;
};

type SubscriptionEntry = {
  status$: BehaviorSubject<boolean>;
  status: boolean;
};

/**
 * Creates a new Tracker.
 *
 * Behavior:
 * - Auto-enables Streamix tracing on first `track()`.
 * - `waitAll()` is serialized using an internal promise queue.
 * - `waitAll()` resolves when all known traces are terminal:
 *   delivered / filtered / collapsed / errored.
 */
export const createTracker = (): Tracker => {
  const subscriptions = new Map<Subscription, SubscriptionEntry>();
  const timeout = 30_000;

  // Serialize waitAll calls.
  let waitQueue: Promise<void> = Promise.resolve();

  // Tracing integration (test-scoped).
  let tracer: ValueTracer | null = null;
  let tracingEnabled = false;

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
   * - Subscribes to tracer events (public API) to avoid polling-only logic.
   * - Also polls at a small interval as a safety net (in case an event is missed).
   * - Ensures proper cleanup of the subscription + timers.
   */
  const waitUsingTracing = (): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      if (!tracer || !tracingEnabled) {
        // No tracer => nothing to wait for.
        resolve();
        return;
      }

      const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => {
        reject(buildTimeoutError(tracer!));
      }, timeout);

      const finish = () => {
        clearTimeout(timeoutId);
        clearInterval(pollId);
        unsubscribe();
        reset();
        resolve();
      };

      // Quick exit if already settled.
      if (allTracesTerminal()) {
        finish();
        return;
      }

      // Event-driven fast path.
      const unsubscribe = tracer.subscribe({
        delivered: () => {
          if (allTracesTerminal()) finish();
        },
        filtered: () => {
          if (allTracesTerminal()) finish();
        },
        collapsed: () => {
          if (allTracesTerminal()) finish();
        },
        dropped: () => {
          if (allTracesTerminal()) finish();
        },
      });

      // Safety net polling.
      const pollId: ReturnType<typeof setInterval> = setInterval(() => {
        if (allTracesTerminal()) finish();
      }, 10);
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

  const waitAll: Tracker["waitAll"] = () => {
    waitQueue = waitQueue.then(async () => {
      // Let initial microtasks enqueue tracing hooks / iterator steps.
      await new Promise<void>(r => queueMicrotask(r));
      await waitUsingTracing();
    });
    return waitQueue;
  };

  return {
    timeout,
    state,
    signal,
    complete,
    track,
    reset,
    waitAll,
  };
};
