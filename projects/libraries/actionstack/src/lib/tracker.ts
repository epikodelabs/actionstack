import { BehaviorSubject, createBehaviorSubject, Stream } from "@actioncrew/streamix";

/**
 * A utility type for tracking the execution status of Streams.
 */
export type Tracker = {
  timeout: number;
  state: (entry: Stream<any>) => boolean;
  signal: (entry: Stream<any>) => void;
  complete: (entry: Stream<any>) => void;
  track: (entry: Stream<any>) => void;
  reset: () => void;
  waitAll: () => Promise<void>;
};

/**
 * Creates a new Tracker for managing the execution status of Streams.
 */
export const createTracker = (): Tracker => {
  const entries = new Map<Stream<any>, { status$: BehaviorSubject<boolean>; status: boolean }>();
  const timeout = 30000;
  let allExecutedQueue: Promise<void> = Promise.resolve();

  const state: Tracker['state'] = (entry) => entries.get(entry)?.status ?? false;

  const signal: Tracker['signal'] = (entry) => {
    const entryData = entries.get(entry);
    if (entryData) {
      entryData.status = true;
      entryData.status$.next(true);
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

  const reset: Tracker['reset'] = () => {
    for (const entryData of entries.values()) {
      entryData.status = false;
      entryData.status$.next(false);
    }
  };

  const waitAll: Tracker['waitAll'] = () => {
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


  return { timeout, state, signal, complete, track, reset, waitAll };
};
