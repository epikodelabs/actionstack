/**
 * Creates an asynchronous queue that processes operations sequentially.
 * Operations are guaranteed to run in the order they are enqueued, one after another.
 * This is useful for preventing race conditions and ensuring that dependent
 * asynchronous tasks are executed in a specific order.
 *
 * @returns {{ enqueue: (operation: () => Promise<any>) => Promise<any>, pending: number, isEmpty: boolean }} An object representing the queue.
 * @property {(operation: () => Promise<any>) => Promise<any>} enqueue Enqueues an asynchronous operation to be executed sequentially.
 * @property {number} pending The number of operations currently in the queue (including the one running).
 * @property {boolean} isEmpty A boolean indicating whether the queue is empty.
 */
export function createQueue() {
  let last: Promise<void> = Promise.resolve();
  let pendingCount = 0;
  let runningCount = 0;

  const enqueue = <T = any>(
    operation: () => Promise<T> | T,
    options?: { inlineIfRunning?: boolean }
  ): Promise<T> => {
    pendingCount++;
    const runOperation = async () => {
      runningCount++;
      try {
        return await operation();
      } finally {
        runningCount--;
      }
    };

    let result: Promise<T>;
    if (options?.inlineIfRunning && runningCount > 0) {
      // Re-entrant enqueue: run inline but still extend the queue chain
      result = Promise.resolve().then(runOperation);
    } else {
      // Create the chained promise that will execute the operation
      result = last.then(runOperation);
    }
    const finalized = result.finally(() => {
      pendingCount--;
    });

    // Chain the next operation (with error handling to prevent queue lock)
    // This maintains the sequential order regardless of operation success/failure
    if (options?.inlineIfRunning && runningCount > 0) {
      last = Promise.all([last, finalized]).then(
        () => undefined,
        () => undefined
      );
    } else {
      last = finalized.then(
        () => undefined,
        () => undefined
      );
    }

    return finalized;
  };

  return {
    enqueue,
    // Utility methods for debugging/monitoring
    get pending() { return pendingCount; },
    get isEmpty() { return pendingCount === 0; }
  };
}

/**
 * Type alias for the queue instance returned by {@link createQueue}.
 */
export type ActionQueue = ReturnType<typeof createQueue>;
