import type { Tracker } from "@epikodelabs/actionstack";
import { type Subscription } from "@epikodelabs/streamix";
import {
  enableTracing,
} from "@epikodelabs/streamix/tracing";
import { CancelablePromise } from "./promise";
import { createTerminalTracer, ExtendedValueTracer } from "./tracer";

const MAX_TRACES = 5_000;
const DEFAULT_TIMEOUT = 30_000;

/**
 * Streamix tracing is effectively global (one active tracer at a time),
 * so this package uses a single shared terminal tracer instance.
 * 
 * Terminal tracer is optimized for production use - it tracks only terminal
 * states (delivered/filtered/collapsed/errored) without operator steps or durations.
 */
let sharedTracer: ExtendedValueTracer | null = null;

function getSharedTracer(): ExtendedValueTracer {
  sharedTracer ??= createTerminalTracer({ maxTraces: MAX_TRACES });
  return sharedTracer;
}

/**
 * Creates a new Tracker for monitoring stream execution.
 * 
 * The tracker uses Streamix's tracing capabilities to monitor value flow through
 * streams and determine when all tracked operations have completed.
 * 
 * Key behaviors:
 * - Enables global Streamix tracing on creation (using terminal tracer for performance)
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
interface TrackerOptions {
  timeout?: number;
}

export const createTracker = (
  options: TrackerOptions = {}
): Tracker & { cancelAll: () => void } => {
  const subscriptions = new Map<Subscription, boolean>();
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  // Serialize waitAll calls - but track queue items for cancellation
  let waitQueue: Promise<void> = Promise.resolve();
  const queuedItems = new Map<symbol, { canceled: boolean }>();
  
  // Track active wait operations for cancellation
  const activeWaits = new Set<CancelablePromise<void>>();

  // Initialize global terminal tracer
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

  const isInFlight = (state: string): boolean =>
    state === "emitted" || state === "processing" || state === "transformed";

  const waitUsingTracing = (): CancelablePromise<void> => {
    return new CancelablePromise<void>(function* () {
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
        if (allTrackedTerminal()) {
          if (allTrackedTerminal()) break;
        }

        if (Date.now() - start > timeout) {
          throw buildTimeoutError(tracer);
        }

        yield new Promise<void>((resolve) => setTimeout(resolve, 10));
      }
    });
  };

  const buildTimeoutError = (tracer: ExtendedValueTracer): Error => {
    const traces = tracer.getAllTraces();
    const inflight = traces.filter((x) => isInFlight(x.state));

    let msg = `Timeout reached waiting for stream execution (${timeout}ms)\n`;
    msg += `Traces: total=${traces.length}, inflight=${inflight.length}\n`;

    if (inflight.length > 0) {
      msg += `\nStill in-flight (showing up to 5):\n`;
      for (const tr of inflight.slice(0, 5)) {
        msg += `- ${tr.valueId} state=${tr.state}`;
        msg += `\n`;
      }
      if (inflight.length > 5) {
        msg += `... and ${inflight.length - 5} more\n`;
      }
    }

    return new Error(msg);
  };

  const enqueueWait = (
    queueId: symbol,
    work: () => Promise<void>
  ): Promise<void> => {
    const run = waitQueue.then(async () => {
      const item = queuedItems.get(queueId);
      if (item?.canceled) {
        // Skip this work, it was cancelled
        return;
      }
      await work();
    });
    // Update queue to point to the new work, swallowing errors
    waitQueue = run.catch(() => {});
    return run;
  };

  const waitAll = (): CancelablePromise<void> => {
    const queueId = Symbol('wait');
    const queueItem = { canceled: false };
    queuedItems.set(queueId, queueItem);

    let innerWait: CancelablePromise<void> | null = null;

    // Outer promise that we will expose as a thenable. We translate the
    // inner queued work outcomes into this promise and reject it when the
    // caller cancels.
    let resolveOuter: () => void;
    let rejectOuter: (err?: any) => void;
    let settled = false;
    const outerPromise = new Promise<void>((resolve, reject) => {
      resolveOuter = resolve;
      rejectOuter = reject;

      const run = enqueueWait(queueId, async () => {
        // If the queue item was canceled before running, the enqueueWait
        // implementation will skip calling this work. We still handle
        // cancellation below via the run completion handler.
        if (queueItem.canceled) {
          // If canceled, resolve outer promise (cancel is normal termination)
          if (!settled) {
            settled = true;
            resolve();
          }
          return;
        }

        // Let microtasks run to set up tracing hooks
        await new Promise<void>((r) => queueMicrotask(r));
        if (queueItem.canceled) {
          if (!settled) {
            settled = true;
            resolve();
          }
          return;
        }

        innerWait = waitUsingTracing();

        // Translate inner wait outcome, but only settle once
        innerWait.then(() => {
          if (!settled) {
            settled = true;
            resolve();
          }
        }, (err) => {
          if (!settled) {
            settled = true;
            reject(err);
          }
        });

        try {
          await Promise.resolve(innerWait);
          if (!queueItem.canceled && !settled) {
            settled = true;
            resolve();
          }
        } finally {
          innerWait = null;
          queuedItems.delete(queueId);
        }
      });

      // If enqueueWait skipped the work because the item was canceled,
      // its returned promise will still settle — handle that to ensure the
      // outer promise is rejected appropriately.
      run.then(() => {
        if (queueItem.canceled && innerWait === null) {
          try {
            if (!settled) {
              settled = true;
              resolve();
            }
          } catch {}
        }
      }, (err) => {
        try {
          if (!settled) {
            settled = true;
            reject(err);
          }
        } catch {}
      }).catch(() => {});
    });

    const thenable: any = {
      cancel: () => {
        queueItem.canceled = true;
        try { if (innerWait) innerWait.cancel(); } catch {}
        try {
          if (!settled) {
            settled = true;
            resolveOuter();
          }
        } catch {}
      },
      then: outerPromise.then.bind(outerPromise),
      catch: outerPromise.catch.bind(outerPromise),
      finally: outerPromise.finally.bind(outerPromise),
      [Symbol.toStringTag]: 'Promise',
    };

    // Track for cancelAll()
    activeWaits.add(thenable as any);
    outerPromise.finally(() => activeWaits.delete(thenable as any));

    return thenable as unknown as CancelablePromise<void>;
  };

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