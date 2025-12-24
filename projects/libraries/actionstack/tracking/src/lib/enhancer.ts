import type { Store, StoreEnhancer, Tracker } from "@epikodelabs/actionstack";
import { createTracker } from "./tracker";

/**
 * Store enhancer that attaches a Tracker instance.
 *
 * Design goals:
 * - ❌ No ActionStack core dependency on tracing
 * - ❌ No behavioral changes to dispatch or middleware
 * - ✅ Optional diagnostics / testing capability
 * - ✅ Explicit synchronization via `waitAll()`
 *
 * The tracker is:
 * - attached to the store instance BEFORE initialization
 * - fully optional at runtime
 * - integrated with select() method for subscription tracking
 * - uses Streamix tracing for `waitAll()` synchronization
 */
export function withTracker(): StoreEnhancer {
  const tracker = createTracker();

  const enhancer: StoreEnhancer = (createStore) => (settings) => {
    const store = createStore(settings);

    /**
     * Attach tracker to the store instance.
     *
     * IMPORTANT: This must happen early so that select() can use it.
     * The select() method in createStore checks for `store.tracker`
     * and integrates with it.
     *
     * Integration points:
     * 1. select() calls tracker.track(subscription) when created
     * 2. select() calls tracker.complete(subscription) on completion/error
     * 3. Tests call tracker.waitAll() to wait for all values to settle
     */
    const storeWithTracker = store as Store & {
      tracker?: Tracker;
      flush?: () => Promise<void>;
    };

    storeWithTracker.tracker = tracker;

    /**
     * Optional convenience helper for tests.
     *
     * Waits for all tracked values to reach terminal states
     * (delivered, filtered, collapsed, dropped, errored).
     *
     * Usage (tests only):
     *   store.dispatch(someAction);
     *   await store.flush();
     *   // All stream emissions have propagated
     */
    storeWithTracker.flush = async () => {
      await tracker.waitAll();
    };

    return storeWithTracker;
  };

  return enhancer;
}

