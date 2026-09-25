import { atom, createSubscription } from '@epikodelabs/streamix';
import type { Atom, Subscription } from '@epikodelabs/streamix';

/** Sentinel used by current-value sources that do not have a value yet. */
export const NO_CURRENT_VALUE = Symbol('actionstack.noCurrentValue');

export type CurrentValue<T> = T | PromiseLike<T> | typeof NO_CURRENT_VALUE;

export interface CurrentSourceOptions<T> {
  /** Preserve repeated equal upstream emissions when false. Defaults to true. */
  dedupe?: boolean;
  /** Reads the latest value when a subscriber attaches. */
  read?: () => CurrentValue<T>;
  /** Connects to future changes while at least one subscriber is attached. */
  connect?: (
    emit: (value: CurrentValue<T>) => void,
    fail: (error: unknown) => void
  ) => Subscription | void;
}

/**
 * Creates a reusable current-value source on top of Streamix atoms.
 *
 * Streamix atoms intentionally observe future emissions only. ActionStack
 * selectors, however, expose state-like semantics: every subscription receives
 * the latest selected value first and then future changes. The upstream
 * connection is released when the last subscriber leaves, while the source
 * itself remains reusable until `dispose()` is called explicitly.
 */
export function createCurrentSource<T>(
  options: CurrentSourceOptions<T>
): Atom<T> {
  const cache = atom<T>();

  let hasValue = false;
  let emissionVersion = 0;
  let resolutionVersion = 0;
  let activeSubscriptions = 0;
  let upstreamSubscription: Subscription | undefined;

  const publish = (value: T): void => {
    if (cache.disposed) return;
    if (options.dedupe !== false && hasValue && Object.is(cache.safeValue, value)) return;

    hasValue = true;
    emissionVersion++;
    cache.next(value);
  };

  const fail = (error: unknown): void => {
    if (cache.disposed) return;
    cache.fail(error);
  };

  const accept = (candidate: CurrentValue<T>): void => {
    if (candidate === NO_CURRENT_VALUE || cache.disposed) return;

    const version = ++resolutionVersion;

    if (
      candidate != null &&
      typeof (candidate as PromiseLike<T>).then === 'function'
    ) {
      void Promise.resolve(candidate).then(
        (value) => {
          if (version === resolutionVersion && !cache.disposed) {
            publish(value);
          }
        },
        (error) => {
          if (version === resolutionVersion && !cache.disposed) {
            fail(error);
          }
        }
      );
      return;
    }

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

    const versionBeforeSubscribe = emissionVersion;
    const innerSubscription = cache.subscribe(callback);
    activeSubscriptions++;

    if (activeSubscriptions === 1) {
      connect();
    }

    refresh();

    // `cache.subscribe()` observes future emissions only. If connecting and
    // refreshing did not publish a new value, replay the cached current value
    // to this subscriber alone.
    if (
      callback &&
      hasValue &&
      emissionVersion === versionBeforeSubscribe &&
      !cache.disposed
    ) {
      callback(cache.safeValue, cache.previous);
    }

    return createSubscription(async () => {
      await innerSubscription();
      activeSubscriptions = Math.max(0, activeSubscriptions - 1);

      if (activeSubscriptions === 0) {
        await upstreamSubscription?.();
        upstreamSubscription = undefined;
        resolutionVersion++;
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
