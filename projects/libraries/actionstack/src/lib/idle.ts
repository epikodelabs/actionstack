/**
 * Waits until the browser reaches an idle slot.
 *
 * This is a scheduler-level quiescence helper used by ActionStack's
 * `awaitStatePropagation` option when callers prefer to defer resolution until
 * the environment had a chance to flush visual/update work.
 *
 * Resolution order:
 * - `requestIdleCallback` when available
 * - `requestAnimationFrame` as a frame-level fallback
 * - `setTimeout(..., 0)` as the final universal fallback
 */
export function waitForBrowserIdle(timeout: number = 50): Promise<void> {
  return new Promise<void>((resolve) => {
    const scope = globalThis as typeof globalThis & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => unknown;
      requestAnimationFrame?: (callback: FrameRequestCallback) => unknown;
    };

    if (typeof scope.requestIdleCallback === "function") {
      scope.requestIdleCallback(() => resolve(), { timeout });
      return;
    }

    if (typeof scope.requestAnimationFrame === "function") {
      scope.requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}
