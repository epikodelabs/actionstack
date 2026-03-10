import type { Store, StoreEnhancer, Tracker } from "@epikodelabs/actionstack";
import { createTracker } from "./tracker";

export function withTracker(): StoreEnhancer {
  const tracker = createTracker();

  return (createStore) => (settings) => {
    const store = createStore(settings);

    const storeWithTracker = store as Store & {
      tracker: Tracker;
      flush: () => Promise<void>;
    };

    storeWithTracker.tracker = tracker;

    storeWithTracker.flush = async () => {
      await tracker.waitAll();
    };

    return storeWithTracker;
  };
}