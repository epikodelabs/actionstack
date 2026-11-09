import { createSubscription, NO_INITIAL_VALUE } from '@epikodelabs/streamix';
import type { Atom, Subscription } from '@epikodelabs/streamix';

/**
 * The selector remains callable with a root-state argument. Its reactive side
 * delegates to exactly one tracked store selector once a store is available.
 * No intermediate Streamix atom or value cache is created.
 */
export interface SelectorBindingOptions<T> {
  create: () => Atom<T>;
  ready: () => boolean;
  /** Listen for module configuration/installation. Called only while parked. */
  onReady: (wake: () => void) => Subscription;
}

type ListenerKind = 'value' | 'error' | 'current';
type Listener = {
  kind: ListenerKind;
  callback: (...args: any[]) => unknown;
  active: boolean;
  subscription?: Subscription;
};

/** Private extension used by tracked current-value sources. */
type CurrentAtom<T> = Atom<T> & {
  onCurrent?: (callback: (value: T) => void) => Subscription;
  isPending?: () => boolean;
};

/**
 * Returns ONE callable Proxy per selector, also providing the observation
 * methods used by its `data$` view. Unlike the `data$` view, the selector
 * function itself is intentionally NOT branded as an Atom.
 * It owns subscriptions awaiting configuration, but never owns selected values.
 */
export function createSelectorProxy<S extends (state: any) => any>(
  selector: S,
  options: SelectorBindingOptions<Awaited<ReturnType<S>>>
): S & Omit<Atom<Awaited<ReturnType<S>>>, 'type'> {
  type T = Awaited<ReturnType<S>>;
  const listeners = new Set<Listener>();
  const readiness = new Set<(source?: CurrentAtom<T>) => void>();
  let source: CurrentAtom<T> | undefined;
  let stopWaiting: Subscription | undefined;
  let installingWait = false;
  let disposed = false;

  const releaseWatch = () => {
    const stop = stopWaiting;
    stopWaiting = undefined;
    if (stop) void stop();
  };

  const attach = (listener: Listener, target: CurrentAtom<T>) => {
    if (!listener.active || disposed) return;
    let subscription: Subscription;
    if (listener.kind === 'value') {
      subscription = target.subscribe(listener.callback as (value: T, previous: T) => unknown);
    } else if (listener.kind === 'error') {
      subscription = target.onError(listener.callback as (error: unknown) => void);
    } else {
      subscription = target.onCurrent
        ? target.onCurrent(listener.callback as (value: T) => void)
        : target.subscribe(listener.callback as (value: T) => void);
    }
    // Subscription may synchronously invoke callbacks that dispose the facade.
    if (!listener.active || disposed) void subscription();
    else listener.subscription = subscription;
  };

  const ensure = (): CurrentAtom<T> | undefined => {
    if (disposed) return undefined;
    if (source) return source;
    if (!options.ready()) {
      if (!stopWaiting && !installingWait) {
        installingWait = true;
        try {
          const stop = options.onReady(() => { void ensure(); });
          if (source || disposed) void stop();
          else stopWaiting = stop;
        } finally {
          installingWait = false;
        }
      }
      // `onReady` may replay synchronously and connect before returning.
      if (source) return source;
      if (!options.ready()) return undefined;
    }
    const created = options.create() as CurrentAtom<T>;
    if (disposed) { created.dispose(); return undefined; }
    source = created;
    releaseWatch();
    // Snapshot: subscribing may synchronously add/remove other listeners.
    for (const listener of [...listeners]) attach(listener, created);
    for (const resolve of readiness) resolve(created);
    readiness.clear();
    return created;
  };

  const register = (kind: ListenerKind, callback: (...args: any[]) => unknown): Subscription => {
    if (disposed) return createSubscription(() => {});
    const listener: Listener = { kind, callback, active: true };
    listeners.add(listener);
    try {
      const target = ensure();
      // ensure() attaches all parked listeners as soon as it creates the source.
      if (target && !listener.subscription && listener.active && !disposed) {
        attach(listener, target);
      }
    } catch (error) {
      listeners.delete(listener);
      listener.active = false;
      throw error;
    }
    return createSubscription(() => {
      listener.active = false;
      listeners.delete(listener);
      const unsubscribe = listener.subscription;
      listener.subscription = undefined;
      if (!listeners.size && !readiness.size && !source) releaseWatch();
      return unsubscribe?.();
    });
  };

  const close = () => {
    if (disposed) return;
    disposed = true;
    releaseWatch();
    for (const listener of listeners) {
      listener.active = false;
      if (listener.subscription) void listener.subscription();
      listener.subscription = undefined;
    }
    listeners.clear();
    for (const resolve of readiness) resolve();
    readiness.clear();
    source?.dispose();
  };

  // An iterator can be cancelled *while* waiting for configuration. Unlike an
  // async-generator awaiting a promise, return() here resolves pending next().
  const iterate = (): AsyncIterableIterator<T> => {
    let cancelled = false;
    let iterator: AsyncIterator<T> | undefined;
    let wake: ((source?: CurrentAtom<T>) => void) | undefined;
    const done = (): IteratorResult<T> => ({ done: true, value: undefined as T });
    const wait = async (): Promise<CurrentAtom<T> | undefined> => {
      const target = ensure();
      if (target) return target;
      if (disposed || cancelled) return undefined;
      return new Promise<CurrentAtom<T> | undefined>(resolve => {
        wake = resolve;
        readiness.add(resolve);
      });
    };
    return {
      async next() {
        if (cancelled || disposed) return done();
        const target = source ?? await wait();
        if (cancelled || disposed || !target) return done();
        iterator ??= target[Symbol.asyncIterator]();
        return iterator.next();
      },
      async return(value?: T) {
        cancelled = true;
        if (wake) { readiness.delete(wake); wake(); wake = undefined; }
        if (!listeners.size && !readiness.size && !source) releaseWatch();
        if (iterator?.return) return iterator.return(value);
        return { done: true, value: value as T };
      },
      async throw(error?: unknown) {
        cancelled = true;
        if (wake) { readiness.delete(wake); wake(); wake = undefined; }
        if (iterator?.throw) return iterator.throw(error);
        throw error;
      },
      [Symbol.asyncIterator]() { return this; },
    };
  };

  // The function target is required because `module.selectors.x(state)` is
  // still a plain selector call. Only reactive operations are intercepted.
  const methods: Record<string, unknown> = {
    subscribe: (callback?: (current: T, previous: T) => unknown) =>
      register('value', callback ?? (() => {})),
    onError: (callback: (error: unknown) => void) => register('error', callback),
    onCurrent: (callback: (value: T) => void) => register('current', callback),
    isPending: () => source?.isPending?.() ?? false,
    dispose: close,
  };
  const properties = new Set<PropertyKey>([
    'value', 'safeValue', 'previous', 'dirty', 'error', 'disposed', 'subscriberCount',
  ]);

  return new Proxy(selector, {
    apply(target, thisArg, args) {
      return Reflect.apply(target, thisArg, args);
    },
    // The Proxy target is a function, whose own shape does NOT contain Atom
    // properties. Angular's *atom directive detects a reactive source via
    // `'subscribe' in value && 'value' in value`; a get trap alone cannot
    // satisfy that check. Report the delegated Atom interface through `in`.
    has(target, key) {
      if (key === Symbol.asyncIterator) return true;
      if (key === 'type') return false; // Callable selectors are not atoms.
      return properties.has(key) ||
        (typeof key === 'string' && Object.prototype.hasOwnProperty.call(methods, key)) ||
        Reflect.has(target, key);
    },
    get(target, key, receiver) {
      if (key === Symbol.asyncIterator) return iterate;
      // Only the non-callable `data$` view is branded as an atom.
      if (key === 'type') return undefined;
      if (key === 'disposed') return disposed;
      if (key === 'subscriberCount') return source?.subscriberCount ?? 0;
      if (properties.has(key)) {
        // Read-through is important: a module may be configured and its state
        // available without anybody subscribing to data$ yet. Resolve the
        // tracked selector on the first value read, not only on subscribe().
        // Metadata probes must remain passive (in particular, no activation
        // just to inspect error/dirty/subscriberCount).
        const target = key === 'value' || key === 'safeValue'
          ? ensure()
          : source;
        if (target) return (target as any)[key];
        if (key === 'error') return undefined;
        if (key === 'dirty') return false;
        return NO_INITIAL_VALUE;
      }
      if (typeof key === 'string' && Object.prototype.hasOwnProperty.call(methods, key)) {
        return methods[key];
      }
      // Preserve ordinary function metadata and identity, e.g. .name/.length.
      if (Reflect.has(target, key)) return Reflect.get(target, key, receiver);
      // Unknown properties must not install a wake listener merely because
      // a framework probes the object (e.g. checking for a `then` method).
      if (!source && !options.ready()) return undefined;
      // Forward implementation-specific methods once the source is ready.
      const inner = ensure() as any;
      const member = inner?.[key];
      return typeof member === 'function' ? member.bind(inner) : member;
    },
  }) as S & Omit<Atom<T>, 'type'>;
}
