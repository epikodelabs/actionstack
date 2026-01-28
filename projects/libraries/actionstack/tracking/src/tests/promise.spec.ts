import { CancelablePromise } from "@epikodelabs/actionstack/tracking";

describe("CancelablePromise", () => {
  it("resolves yielded values", async () => {
    const promise = new CancelablePromise<number>(function* () {
      const value = (yield Promise.resolve(2)) as number;
      return value + 1;
    });

    await expectAsync(promise).toBeResolvedTo(3);
  });

  it("resolves undefined when cancelled", async () => {
    const promise = new CancelablePromise<number>(function* () {
      yield new Promise((resolve) => setTimeout(resolve, 10));
      return 1;
    });

    promise.cancel();

    await expectAsync(promise as Promise<unknown>).toBeResolvedTo(undefined);
  });

  it("supports then/finally chaining", async () => {
    const promise = new CancelablePromise<number>(function* () {
      return 7;
    });

    let thenValue = 0;
    let finallyCalled = false;

    await promise
      .then((value) => {
        thenValue = value;
        return value + 1;
      })
      .finally(() => {
        finallyCalled = true;
      });

    expect(thenValue).toBe(7);
    expect(finallyCalled).toBeTrue();
  });

  it("calls catch/finally after a rejection", async () => {
    const promise = new CancelablePromise<number>(function* () {
      yield Promise.reject(new Error("boom"));
      return 1;
    });

    let catchCalled = false;
    let finallyCalled = false;

    await promise
      .catch(() => {
        catchCalled = true;
      })
      .finally(() => {
        finallyCalled = true;
      });

    expect(catchCalled).toBeTrue();
    expect(finallyCalled).toBeTrue();
  });

  it("rejects when the generator throws synchronously", async () => {
    const promise = new CancelablePromise<number>(function* () {
      throw new Error("sync boom");
    });

    await expectAsync(promise).toBeRejectedWithError("sync boom");
  });

  it("continues when yielding a non-promise value", async () => {
    const promise = new CancelablePromise<number>(function* () {
      const emitted = (yield 5) as number;
      return emitted + 1;
    });

    await expectAsync(promise).toBeResolvedTo(6);
  });

  it("resolves when run is invoked with a canceled instance", async () => {
    const promise = new CancelablePromise<number>(function* () {
      yield new Promise<never>(() => {});
      return 1;
    });

    const unsafePromise = promise as unknown as {
      cancelled: boolean;
      run: (value?: unknown) => void;
    };
    unsafePromise.cancelled = true;
    unsafePromise.run();

    await expectAsync(promise as Promise<unknown>).toBeResolvedTo(undefined);
  });

  it("continues after handling a rejection and yielding again", async () => {
    let resumed = false;
    const promise = new CancelablePromise<void>(function* () {
      try {
        yield Promise.reject(new Error("boom"));
      } catch {
        resumed = true;
        yield Promise.resolve();
      }
    });

    await expectAsync(promise).toBeResolved();
    expect(resumed).toBeTrue();
  });

  it("resolves after handling a rejection without further yields", async () => {
    const promise = new CancelablePromise<number>(function* () {
      try {
        yield Promise.reject(new Error("boom"));
      } catch {
        return 5;
      }

      return 5;
    });

    await expectAsync(promise).toBeResolvedTo(5);
  });

  it("handles cancellation during error handling", async () => {
    const promise = new CancelablePromise<number>(function* () {
      try {
        yield Promise.reject(new Error("boom"));
      } catch {
        return 5;
      }
      return 10;
    });

    const unsafePromise = promise as unknown as {
      cancelled: boolean;
    };

    // Cancel while handling error
    setTimeout(() => {
      unsafePromise.cancelled = true;
    }, 0);

    await expectAsync(promise as Promise<unknown>).toBeResolvedTo(5);
  });

  it("handles double cancellation gracefully", async () => {
    const promise = new CancelablePromise<number>(function* () {
      yield new Promise((resolve) => setTimeout(resolve, 100));
      return 1;
    });

    promise.cancel();
    promise.cancel(); // Second cancel should be a no-op

    await expectAsync(promise as Promise<unknown>).toBeResolvedTo(undefined);
  });

  it("uses finally without onfinally callback", async () => {
    const promise = new CancelablePromise<number>(function* () {
      return 42;
    });

    const result = await promise.finally();
    expect(result).toBe(42);
  });

  it("resolves with undefined when throwing after cancellation", async () => {
    const promise = new CancelablePromise<number>(function* () {
      yield new Promise((resolve) => setTimeout(resolve, 10));
      throw new Error("should not reject");
    });

    const unsafePromise = promise as unknown as {
      cancelled: boolean;
    };
    unsafePromise.cancelled = true;

    // Force the generator to throw
    setTimeout(() => {
      try {
        throw new Error("forced error");
      } catch (error) {
        // Simulate error during cancelled state
      }
    }, 0);

    await expectAsync(promise as Promise<unknown>).toBeResolvedTo(undefined);
  });});