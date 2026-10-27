import { atom, createSubscription } from '@epikodelabs/streamix';
import type { Atom, Subscription } from '@epikodelabs/streamix';

/** Sentinel used by current-value sources that do not have a value yet. */
export const NO_CURRENT_VALUE = Symbol('actionstack.noCurrentValue');

export type CurrentValue<T> = T | PromiseLike<T> | typeof NO_CURRENT_VALUE;

export interface CurrentSourceOptions<T> {
  /** Preserve repeated equal upstream emissions when false. Defaults to true. */
  dedupe?: boolean;
  /** Reads the latest value when a subscriber attaches if connect does not provide one. */
  read?: () => CurrentValue<T>;
  /** Connects to current and future changes while at least one subscriber is attached. */
  connect?: (
    emit: (value: CurrentValue<T>) => void,
    fail: (error: unknown) => void
  ) => Subscription | void;
}

/**
 * Creates a reusable current-value source on top of Streamix atoms.
 *
 * Streamix 3 atoms replay their current value when subscribed. ActionStack uses
 * that behavior to synchronize the cache before exposing it to a new subscriber.
 * This avoids both duplicate initial emissions and stale cached values after all
 * subscribers detached and the upstream source changed while disconnected.
 *
 * The upstream connection is released when the last subscriber leaves, while
 * the source itself remains reusable until `dispose()` is called explicitly.
 */
export function createCurrentSource<T>(
  options: CurrentSourceOptions<T>
): Atom<T> {
  const cache = atom<T>();

  let hasValue = false;
  let resolutionVersion = 0;
  let pendingResolution = false;
  let activeSubscriptions = 0;
  let upstreamSubscription: Subscription | undefined;
  // Subscribers that attached while a resolution was pending and skipped the
  // stale cache replay. Resolutions bypass dedupe while any exist, so a value
  // equal to the cache still reaches them instead of arriving never.
  let staleReplaySubscribers = 0;

  const publish = (value: T): void => {
    if (cache.disposed) return;
    // Subscribers waiting past a stale replay must receive the pending value
    // even when it equals the cache; delivering it ends their wait.
    const bypassDedupe = staleReplaySubscribers > 0;
    if (!bypassDedupe && options.dedupe !== false && hasValue && Object.is(cache.safeValue, value)) {
      return;
    }

    staleReplaySubscribers = 0;
    hasValue = true;
    cache.next(value);
  };

  const fail = (error: unknown): void => {
    if (cache.disposed) return;
    pendingResolution = false;
    cache.fail(error);
  };

  const accept = (candidate: CurrentValue<T>): void => {
    if (candidate === NO_CURRENT_VALUE || cache.disposed) return;

    const version = ++resolutionVersion;

    if (
      candidate != null &&
      typeof (candidate as PromiseLike<T>).then === 'function'
    ) {
      pendingResolution = true;
      void Promise.resolve(candidate).then(
        (value) => {
          if (version === resolutionVersion && !cache.disposed) {
            pendingResolution = false;
            publish(value);
          }
        },
        (error) => {
          if (version === resolutionVersion && !cache.disposed) {
            pendingResolution = false;
            fail(error);
          }
        }
      );
      return;
    }

    pendingResolution = false;
    publish(candidate as T);
  };

  const connect = (): void => {
    if (upstreamSubscription || !options.connect || cache.disposed) return;

    try {
      upstreamSubscription = options.connect(accept, fail) ?? undefined;
    } catch (error) {
      fail(error);
    }
  };

  const disconnect = (): void => {
    resolutionVersion++;
    pendingResolution = false;
    const upstream = upstreamSubscription;
    upstreamSubscription = undefined;
    upstream?.();
  };

  const refresh = (): void => {
    if (!options.read || cache.disposed) return;

    try {
      accept(options.read());
    } catch (error) {
      fail(error);
    }
  };

  const source = Object.create(cache) as Atom<T>;
  // True while an accepted selection is still resolving: subscribers attaching
  // now will skip the stale cache replay, and wrappers can suppress theirs too.
  (source as any).isPending = () => pendingResolution;

  source.subscribe = (callback) => {
    if (cache.disposed) {
      return createSubscription(() => {});
    }

    const activating = activeSubscriptions === 0;

    if (activating) {
      // Streamix 3 atoms replay synchronously on subscribe, so connecting first
      // normally refreshes the cache to the upstream current value. `read` is
      // retained as a fallback for non-replaying/custom sources.
      const resolutionBeforeConnect = resolutionVersion;
      connect();

      if (resolutionVersion === resolutionBeforeConnect) {
        refresh();
      }
    }

    // While a current selection is still pending, the cache may hold the value
    // from a previous connection or resolution. Streamix would replay that
    // stale value immediately to ANY subscriber attaching now, so suppress
    // exactly that replay and let the pending selection deliver instead.
    // Resolutions bypass dedupe while suppressed subscribers exist, so the
    // pending value always reaches them even when it equals the cache.
    const suppressStaleReplay = pendingResolution && hasValue;
    let firstDelivery = true;
    if (suppressStaleReplay) staleReplaySubscribers++;

    const innerSubscription = cache.subscribe((value, previous) => {
      if (suppressStaleReplay && firstDelivery) {
        // The stale replay is skipped; the counter stays raised so the
        // pending resolution bypasses dedupe and reaches this subscriber.
        firstDelivery = false;
        return;
      }

      firstDelivery = false;
      callback?.(value, previous);
    });

    activeSubscriptions++;

    return createSubscription(async () => {
      await innerSubscription();
      activeSubscriptions = Math.max(0, activeSubscriptions - 1);

      if (suppressStaleReplay && firstDelivery) {
        // Detached before the pending resolution arrived; its bypass dies here.
        staleReplaySubscribers = Math.max(0, staleReplaySubscribers - 1);
      }

      if (activeSubscriptions === 0) {
        disconnect();
      }
    });
  };

  source.dispose = () => {
    if (cache.disposed) return;
    disconnect();
    cache.dispose();
  };

  return source;
}
