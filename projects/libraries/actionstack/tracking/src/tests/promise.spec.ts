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
});
