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

  const publish = (value: T): void => {
    if (cache.disposed) return;
    if (options.dedupe !== false && hasValue && Object.is(cache.safeValue, value)) {
      return;
    }

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

    // When the activating current value is async, cache may still contain the
    // value from the previous connection. Streamix would replay that stale value
    // immediately, so suppress exactly that replay and wait for the pending
    // current selection to resolve.
    const suppressStaleReplay = activating && pendingResolution && hasValue;
    let firstDelivery = true;

    const innerSubscription = cache.subscribe((value, previous) => {
      if (suppressStaleReplay && firstDelivery) {
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
