/**
 * A cancelable promise implementation using generators
 */
export class CancelablePromise<T> {
  private generator: Generator<unknown, T, unknown>;
  private cancelled = false;
  private resolve!: (value: T | PromiseLike<T>) => void;
  private reject!: (reason?: any) => void;
  private promise: Promise<T>;
  private onCancelCallbacks: Array<() => void> = [];
  private wasCancelled = false;
  public readonly [Symbol.toStringTag] = 'Promise';

  constructor(generatorFn: () => Generator<unknown, T, unknown>) {
    this.generator = generatorFn();
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
      this.run();
    });
  }

  private run(value?: unknown): void {
    if (this.cancelled) {
      // If cancelled, resolve with undefined (or a special value)
      // instead of rejecting
      this.resolve(undefined as T);
      return;
    }

    try {
      const result = this.generator.next(value);
      
      if (result.done) {
        this.resolve(result.value);
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
                  this.resolve(errorResult.value);
                } else {
                  this.run(errorResult.value);
                }
              } catch (error) {
                this.reject(error);
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
        this.reject(error);
      } else {
        // If cancelled, resolve instead of reject
        this.resolve(undefined as T);
      }
    }
  }

  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.wasCancelled = true;
    
    try {
      this.generator.return(undefined as any);
    } catch {
      // Ignore errors during cancellation
    }
    
    // Don't reject, just resolve with undefined
    // This prevents unhandled rejections
    this.resolve(undefined as T);
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
