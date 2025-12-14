import { BehaviorSubject, createBehaviorSubject, Stream } from "@actioncrew/streamix";

/**
 * A utility type for tracking the execution status of Streams.
 */
export type Tracker = {
  timeout: number;
  getStatus: (entry: Stream<any>) => boolean;
  setStatus: (entry: Stream<any>, value: boolean) => void;
  complete: (entry: Stream<any>) => void;
  track: (entry: Stream<any>) => void;
  remove: (entry: Stream<any>) => void;
  reset: () => void;
  allExecuted: () => Promise<void>;
};

/**
 * Creates a new Tracker for managing the execution status of Streams.
 */
export const createTracker = (): Tracker => {
  const entries = new Map<Stream<any>, { status$: BehaviorSubject<boolean>; status: boolean }>();
  const timeout = 30000;
  let allExecutedQueue: Promise<void> = Promise.resolve();

  const getStatus: Tracker['getStatus'] = (entry) => entries.get(entry)?.status ?? false;

  const setStatus: Tracker['setStatus'] = (entry, value) => {
    const entryData = entries.get(entry);
    if (entryData) {
      entryData.status = value;
      entryData.status$.next(value);
    }
  };

  const complete: Tracker['complete'] = (entry) => {
    const entryData = entries.get(entry);
    if (entryData) {
      entryData.status = false;
      entryData.status$.complete();
      entries.delete(entry);
    }
  };

  const track: Tracker['track'] = (entry) => {
    if (!entries.has(entry)) {
      const subject = createBehaviorSubject<boolean>(false);
      entries.set(entry, { status$: subject, status: false });
    }
  };

  const remove: Tracker['remove'] = (entry) => {
    const entryData = entries.get(entry);
    if (entryData) {
      entryData.status$.complete();
      entries.delete(entry);
    }
  };

  const reset: Tracker['reset'] = () => {
    for (const entryData of entries.values()) {
      entryData.status = false;
      entryData.status$.next(false);
    }
  };

  const allExecuted: Tracker['allExecuted'] = () => {
    allExecutedQueue = allExecutedQueue.then(
      () =>
        new Promise<void>((resolve, reject) => {
          queueMicrotask(() => {
            if (entries.size === 0) {
              reset();
              resolve();
              return;
            }

            const snapshot = Array.from(entries.entries());

            const timeoutId = setTimeout(
              () => reject("Timeout reached"),
              timeout
            );

            let pending = snapshot.length;
            const done = new Set<Stream<any>>();
            const activated = new Set<Stream<any>>();

            const tryResolve = () => {
              if (pending === 0) {
                clearTimeout(timeoutId);
                reset();
                resolve();
              }
            };

            for (const [entry, entryData] of snapshot) {
              entryData.status$.subscribe({
                next: (status) => {
                  if (status) {
                    activated.add(entry);
                    return;
                  }

                  // ignore initial false
                  if (!activated.has(entry)) return;

                  if (!done.has(entry)) {
                    done.add(entry);
                    pending--;
                    tryResolve();
                  }
                },
                complete: () => {
                  if (!done.has(entry)) {
                    done.add(entry);
                    pending--;
                    tryResolve();
                  }
                },
              });
            }
          });
        })
    );

    return allExecutedQueue;
  };


  return { timeout, getStatus, setStatus, complete, track, remove, reset, allExecuted };
};
