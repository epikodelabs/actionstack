// with-tracker.ts
import type { Store, StoreEnhancer, Tracker } from "@epikodelabs/actionstack";
import { Stream } from "@epikodelabs/streamix";
import { enableTracing } from "@epikodelabs/streamix/tracing";
import { createTerminalTracer } from "./tracer";
import { createTracker } from "./tracker";

export function withTracker(): StoreEnhancer {
  const tracer = createTerminalTracer();
  const tracker = createTracker(tracer);
  
  enableTracing(tracer);
  
  return (createStore) => (settings) => {
    const store = createStore(settings);

    const storeWithTracker = store as Store & {
      tracker: Tracker;
      flush: () => Promise<void>;
    };

    storeWithTracker.tracker = tracker;

    const originalSelect = store.select;

    const selectWrapper = (
      selector: (state: any) => any,
      defaultValue?: any
    ): Stream<any> => {
      const stream = originalSelect.apply(store, [selector, defaultValue]);
      const originalSubscribe = stream.subscribe;

      stream.subscribe = function (
        this: any,
        observerOrNext: any,
        error?: any,
        complete?: any
      ) {
        const originalObserver = typeof observerOrNext === 'function'
          ? { next: observerOrNext, error, complete }
          : observerOrNext;

        let subscription: any;

        // Create proxy observer
        const proxyObserver = {
          next: (val: any) => originalObserver?.next?.(val),
          error: (err: any) => {
            originalObserver?.error?.(err);
            if (subscription) tracker.complete(subscription);
          },
          complete: () => {
            originalObserver?.complete?.();
            if (subscription) tracker.complete(subscription);
          }
        };

        // Call original subscribe to get the subscription
        subscription = originalSubscribe.call(this, proxyObserver);

        if (tracker) {
          tracker.track(subscription);

          // Wrap unsubscribe
          const originalUnsubscribe = subscription.unsubscribe;
          subscription.unsubscribe = function (this: any) {
            tracker.complete(subscription);
            return originalUnsubscribe.apply(this);
          };
        }

        return subscription;
      };

      return stream;
    };

    store.select = selectWrapper as typeof store.select;

    storeWithTracker.flush = async () => {
      await tracker.waitAll();
    };

    return storeWithTracker;
  };
}