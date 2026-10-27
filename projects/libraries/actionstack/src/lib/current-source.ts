import { atom, createSubscription } from '@epikodelabs/streamix';
import type { Atom, Subscription } from '@epikodelabs/streamix';

/** Sentinel used by current-value sources that do not have a value yet. */
export const NO_CURRENT_VALUE = Symbol('actionstack.noCurrentValue');

export type CurrentValue<T> = T | PromiseLike<T> | typeof NO_CURRENT_VALUE;

export interface CurrentSourceOptions<T> {
  /** Preserve repeated equal upstream emissions when false. Defaults to true. */
  dedupe?: boolean;
  /** Internal readiness bridge for wrappers around another current-value source. */
  isPending?: () => boolean;
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
  let connected = false;
  let connectionVersion = 0;
  type Observer = { active: boolean; waiting: boolean; hasValue: boolean; value?: T };
  const waiting = new Set<Observer>();
  // Wrappers need confirmation of a current value even when the ordinary
  // subscribers suppress an equal result. This stays internal to the source.
  const currentListeners = new Set<(value: T) => void>();
  const isPending = (): boolean => pendingResolution || options.isPending?.() === true;
  const equals = (previous: T, next: T): boolean =>
    options.dedupe !== false && Object.is(previous, next);

  const publish = (value: T): void => {
    if (cache.disposed) return;
    // A waiting subscriber still needs its first confirmed value when the
    // selection equals the cache. Per-observer dedupe prevents duplicate
    // delivery to existing subscribers when that confirmation is broadcast.
    const version = resolutionVersion;
    if (!(hasValue && equals(cache.safeValue as T, value) && waiting.size === 0)) {
      hasValue = true;
      cache.next(value);
    }
    for (const listener of [...currentListeners]) {
      if (cache.disposed || version !== resolutionVersion) break;
      listener(value);
    }
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
    if (connected || !options.connect || cache.disposed) return;

    connected = true;
    const version = ++connectionVersion;
    try {
      const subscription = options.connect(
        candidate => { if (connected && version === connectionVersion) accept(candidate); },
        error => { if (connected && version === connectionVersion) fail(error); }
      ) ?? undefined;
      // A synchronous emission may dispose or disconnect this source before
      // connect() returns its teardown. Do not retain that obsolete connection.
      if (connected && version === connectionVersion && !cache.disposed) {
        upstreamSubscription = subscription;
      } else {
        void subscription?.();
      }
    } catch (error) {
      fail(error);
    }
  };

  const disconnect = (): void | Promise<void> => {
    resolutionVersion++;
    pendingResolution = false;
    connected = false;
    connectionVersion++;
    const upstream = upstreamSubscription;
    upstreamSubscription = undefined;
    return upstream?.();
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

    const activating = activeSubscriptions++ === 0;

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

    const observer: Observer = { active: true, waiting: isPending(), hasValue: false };
    let skipReplay = observer.waiting && hasValue;
    if (observer.waiting) waiting.add(observer);

    const innerSubscription = cache.subscribe((value, previous) => {
      if (!observer.active) return;
      if (skipReplay) {
        skipReplay = false;
        return;
      }

      observer.waiting = false;
      waiting.delete(observer);
      if (observer.hasValue && equals(observer.value as T, value)) return;
      observer.hasValue = true;
      observer.value = value;
      return callback?.(value, previous);
    });

    return createSubscription(() => {
      observer.active = false;
      waiting.delete(observer);
      activeSubscriptions = Math.max(0, activeSubscriptions - 1);
      const inner = innerSubscription();
      const upstream = activeSubscriptions === 0 ? disconnect() : undefined;
      return Promise.all([inner, upstream]).then(() => undefined);
    });
  };

  // True while an accepted selection is still resolving: subscribers attaching
  // now will skip the stale cache replay, and wrappers can suppress theirs too.
  (source as any).isPending = isPending;
  (source as any).onCurrent = (listener: (value: T) => void): Subscription => {
    if (cache.disposed) return createSubscription(() => {});
    currentListeners.add(listener);
    if (hasValue && !isPending()) listener(cache.safeValue as T);
    return createSubscription(() => { currentListeners.delete(listener); });
  };

  source.dispose = () => {
    if (cache.disposed) return;
    void disconnect();
    waiting.clear();
    currentListeners.clear();
    cache.dispose();
  };

  return source;
}
