/**
 * A cancelable promise implementation using generators
 */
export class CancelablePromise<T> {
  private generator: Generator<unknown, T | undefined, unknown>;
  private cancelled = false;
  private resolve!: (value: T | PromiseLike<T>) => void;
  private reject!: (reason?: any) => void;
  private promise: Promise<T>;
  public readonly [Symbol.toStringTag] = 'Promise';

  // Use microtask-settling helpers to avoid triggering
  // runtime unhandled rejection detection before callers
  // have a chance to attach handlers.
  private safeResolve = (value?: T) => {
    queueMicrotask(() => this.resolve(value as T));
  };

  private safeReject = (reason?: any) => {
    queueMicrotask(() => this.reject(reason));
  };

  constructor(generatorFn: () => Generator<unknown, T | undefined, unknown>) {
    this.generator = generatorFn();
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
      // Defer running the generator to the next microtask so callers
      // have a chance to attach handlers synchronously (e.g. .then/.catch).
      queueMicrotask(() => this.run());
    });
  }

  private run(value?: unknown): void {
    if (this.cancelled) {
      // If cancelled, resolve with undefined (the original behaviour).
      // Use microtask settle to avoid unhandled rejection races.
      this.safeResolve(undefined as T);
      return;
    }

    try {
      const result = this.generator.next(value);
      
      if (result.done) {
        this.safeResolve(result.value as T);
        return;
      }

      // Handle yielded value (could be a Promise or anything)
      const yieldedValue = result.value;
      if (yieldedValue && typeof yieldedValue === 'object' && 'then' in yieldedValue) {
        // It's a Promise-like object
        (yieldedValue as Promise<unknown>).then(
          (val) => {
            if (!this.cancelled) {
              this.run(val);
            }
          },
          (err) => {
            if (!this.cancelled) {
              try {
                const errorResult = this.generator.throw(err);
                if (errorResult.done) {
                  this.safeResolve(errorResult.value as T);
                } else {
                  this.run(errorResult.value);
                }
              } catch (error) {
                this.safeReject(error);
              }
            }
          }
        );
      } else {
        // It's a non-Promise value
        this.run(yieldedValue);
      }
    } catch (error) {
      if (!this.cancelled) {
        this.safeReject(error);
      } else {
        // If cancelled, resolve instead of reject (preserve original semantics)
        this.safeResolve(undefined as T);
      }
    }
  }

  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    
    try {
      this.generator.return(undefined as any);
    } catch {
      // Ignore errors during cancellation
    }
    
    // Don't reject, just resolve with undefined
    // This prevents unhandled rejections; settle on microtask.
    this.safeResolve(undefined as T);
  }

  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | null
  ): Promise<T | TResult> {
    return this.promise.catch(onrejected);
  }

  finally(onfinally?: (() => void) | null): Promise<T> {
    return this.promise.finally(onfinally);
  }
}
