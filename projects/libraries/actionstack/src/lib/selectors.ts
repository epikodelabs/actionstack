import { atom, createSubscription, NO_INITIAL_VALUE, type Atom, type Subscription } from '@epikodelabs/streamix';

/**
 * A selector extracts a value from state.
 */
export type Selector<T, R> = (state: T) => R;

/**
 * Helper types for inference
 */
export type AnySelector = (state: any) => any;

export type StateOf<F> =
  F extends (state: infer S) => any ? S : never;

export type ResultOf<F> =
  F extends (state: any) => infer R ? R : never;

/**
 * Recursively resolves the type of a deeply nested property based on a path array.
 *
 * - []        -> T
 * - ['a']     -> T['a']
 * - ['a','b'] -> T['a']['b']
 */
export type ValueAtPath<T, P extends readonly any[]> =
  P extends readonly []
    ? T
    : P extends readonly [infer K, ...infer Rest]
      ? K extends keyof T
        ? ValueAtPath<T[K], Extract<Rest, readonly any[]>>
        : unknown
      : unknown;

/**
 * Variadic selector creator.
 *
 * Rules:
 * - selector(fn)                     → projection / identity
 * - selector(a, projector)           → derived
 * - selector(a, b, projector)        → derived
 *
 * The state type is inferred from the FIRST selector.
 */
export function selector<
  S1 extends AnySelector,
  R
>(
  s1: S1
): Selector<StateOf<S1>, ResultOf<S1>>;

export function selector<
  S1 extends AnySelector,
  R
>(
  s1: S1,
  projector: (r1: ResultOf<S1>) => R
): Selector<StateOf<S1>, R>;

export function selector<
  S1 extends AnySelector,
  S2 extends AnySelector,
  R
>(
  s1: S1,
  s2: S2,
  projector: (r1: ResultOf<S1>, r2: ResultOf<S2>) => R
): Selector<StateOf<S1>, R>;

export function selector<
  S1 extends AnySelector,
  S2 extends AnySelector,
  S3 extends AnySelector,
  R
>(
  s1: S1,
  s2: S2,
  s3: S3,
  projector: (r1: ResultOf<S1>, r2: ResultOf<S2>, r3: ResultOf<S3>) => R
): Selector<StateOf<S1>, R>;

export function selector<
  S1 extends AnySelector,
  S2 extends AnySelector,
  S3 extends AnySelector,
  S4 extends AnySelector,
  R
>(
  s1: S1,
  s2: S2,
  s3: S3,
  s4: S4,
  projector: (r1: ResultOf<S1>, r2: ResultOf<S2>, r3: ResultOf<S3>, r4: ResultOf<S4>) => R
): Selector<StateOf<S1>, R>;

export function selector(...fns: any[]): any {
  // Single selector → identity
  if (fns.length === 1) {
    const sel = fns[0];
    return (state: any) => {
      try {
        const v = sel(state);
        return v == null ? undefined : v;
      } catch {
        return undefined;
      }
    };
  }

  const projector = fns[fns.length - 1];
  const inputs = fns.slice(0, -1);

  return (state: any) => {
    const values = new Array(inputs.length);

    for (let i = 0; i < inputs.length; i++) {
      const v = inputs[i](state);

      if (v == null) {
        return undefined;
      }

      values[i] = v;
    }

    return projector(...values);
  };
}


/**
 * Async variadic selector creator.
 *
 * Rules:
 * - selectorAsync(fn)                     → async projection
 * - selectorAsync(a, asyncProjector)      → async derived
 * - selectorAsync(a, b, asyncProjector)   → async derived
 *
 * Input selectors are synchronous.
 * Only the projector may be async.
 */
export function selectorAsync<
  S1 extends AnySelector,
  R
>(
  s1: S1
): (state: StateOf<S1>) => Promise<ResultOf<S1>>;

export function selectorAsync<
  S1 extends AnySelector,
  R
>(
  s1: S1,
  projector: (r1: ResultOf<S1>) => Promise<R>
): (state: StateOf<S1>) => Promise<R>;

export function selectorAsync<
  S1 extends AnySelector,
  S2 extends AnySelector,
  R
>(
  s1: S1,
  s2: S2,
  projector: (r1: ResultOf<S1>, r2: ResultOf<S2>) => Promise<R>
): (state: StateOf<S1>) => Promise<R>;

export function selectorAsync<
  S1 extends AnySelector,
  S2 extends AnySelector,
  S3 extends AnySelector,
  R
>(
  s1: S1,
  s2: S2,
  s3: S3,
  projector: (r1: ResultOf<S1>, r2: ResultOf<S2>, r3: ResultOf<S3>) => Promise<R>
): (state: StateOf<S1>) => Promise<R>;

export function selectorAsync<
  S1 extends AnySelector,
  S2 extends AnySelector,
  S3 extends AnySelector,
  S4 extends AnySelector,
  R
>(
  s1: S1,
  s2: S2,
  s3: S3,
  s4: S4,
  projector: (r1: ResultOf<S1>, r2: ResultOf<S2>, r3: ResultOf<S3>, r4: ResultOf<S4>) => Promise<R>
): (state: StateOf<S1>) => Promise<R>;

export function selectorAsync(...fns: any[]): any {
  if (fns.length === 1) {
    const sel = fns[0];
    return async (state: any) => {
      try {
        const v = await sel(state);
        return v == null ? undefined : v;
      } catch {
        return undefined;
      }
    };
  }

  const projector = fns[fns.length - 1];
  const inputs = fns.slice(0, -1);

  return async (state: any) => {
    const values = new Array(inputs.length);

    for (let i = 0; i < inputs.length; i++) {
      const v = inputs[i](state);

      if (v == null) {
        return undefined;
      }

      values[i] = v;
    }

    return await projector(...values);
  };
}


/**
 * Bridges selection to a single native Streamix atom. While observed, the
 * upstream source is connected; on reconnect its current state is selected
 * again before the cached value can be replayed to new subscribers.
 *
 * `project` is responsible for resolving async failures; generations prevent
 * late completions from a previous connection or selection overwriting newer
 * values. The native atom alone owns value storage and async callback delivery.
 */
function selectFromAtom<T, R>(
  stateAtom: Atom<T>,
  project: (state: T) => R | Promise<R>,
): Atom<R> {
  const cache = atom<R>();
  let count = 0;
  let disposed = false;
  let generation = 0;
  let upstream: Subscription | undefined;
  let pending = false;

  const accept = (candidate: R | Promise<R>) => {
    if (disposed || count === 0) return;
    const epoch = ++generation;
    pending = candidate != null && typeof (candidate as PromiseLike<R>).then === 'function';
    if (pending) {
      void Promise.resolve(candidate).then(value => {
        if (disposed || epoch !== generation) return;
        pending = false;
        cache.next(value); // selectStream deliberately preserves equal emissions
      }, error => {
        if (disposed || epoch !== generation) return;
        pending = false;
        cache.fail(error);
      });
    } else {
      cache.next(candidate as R);
    }
  };

  const start = () => {
    if (upstream || disposed) return;
    let received = false;
    // A Streamix atom replays its value synchronously on subscribe.
    const subscription = stateAtom.subscribe(state => {
      received = true;
      try { accept(project(state)); }
      catch (error) { cache.fail(error); }
    });
    if (disposed || count === 0) {
      void subscription();
      return;
    }
    upstream = subscription;
    // Support foreign atom-like sources that don't replay synchronously.
    if (!received) {
      try {
        const value = stateAtom.value;
        if (value !== NO_INITIAL_VALUE) accept(project(value));
      } catch (error) { cache.fail(error); }
    }
  };

  const source = Object.create(cache) as Atom<R>;

  // Cold selections must be readable synchronously, without requiring a
  // subscription. There is no upstream listener in this state, so always read
  // the latest upstream value instead of trusting an old cached projection.
  const readCold = (safe = false): R => {
    if (disposed || count > 0) return safe ? cache.safeValue : cache.value;
    try {
      const state = stateAtom.value;
      if (state === NO_INITIAL_VALUE) return safe ? cache.safeValue : NO_INITIAL_VALUE as R;
      const candidate = project(state);
      if (candidate != null && typeof (candidate as PromiseLike<R>).then === 'function') {
        // Async selectors still need a subscription to publish their result.
        // Consume detached rejection without changing the subscribed error path.
        void Promise.resolve(candidate).then(() => undefined, () => undefined);
        return safe ? cache.safeValue : NO_INITIAL_VALUE as R;
      }
      if (cache.safeValue === NO_INITIAL_VALUE || !Object.is(cache.safeValue, candidate)) {
        cache.next(candidate as R);
      }
      return cache.value;
    } catch (error) {
      cache.fail(error);
      return safe ? cache.safeValue : cache.value;
    }
  };
  Object.defineProperties(source, {
    value: { get: () => readCold() },
    safeValue: { get: () => readCold(true) },
  });

  source.subscribe = callback => {
    if (disposed) return createSubscription(() => {});
    count++;
    if (count === 1) start();
    const observer = { active: true };
    const skipStale = pending && cache.safeValue !== NO_INITIAL_VALUE;
    let replay = skipStale;
    const inner = cache.subscribe((value, previous) => {
      if (!observer.active) return;
      if (replay) { replay = false; return; }
      return callback?.(value, previous);
    });
    return createSubscription(() => {
      observer.active = false;
      const result = inner();
      count--;
      if (count === 0) {
        generation++;
        pending = false;
        const stop = upstream;
        upstream = undefined;
        void stop?.();
      }
      return result;
    });
  };
  source.dispose = () => {
    if (disposed) return;
    disposed = true;
    generation++;
    pending = false;
    const stop = upstream;
    upstream = undefined;
    void stop?.();
    cache.dispose();
  };
  return source;
}

/** Selects current and future values synchronously, including equal emissions. */
export function selectStream<T, R>(selector: Selector<T, R>, stateAtom: Atom<T>): Atom<R> {
  return selectFromAtom(stateAtom, selector);
}

/** Async selection. Stale promises are ignored; errors warn and yield undefined. */
export function selectStreamAsync<T, R>(
  selector: (state: T) => Promise<R>, stateAtom: Atom<T>,
): Atom<R> {
  const resolve = async (state: T): Promise<R | undefined> => {
    try { return await selector(state); }
    catch (error: any) {
      console.warn(`Error in async selector: ${error?.message ?? error}`);
      return undefined;
    }
  };
  return selectFromAtom(stateAtom, resolve as (state: T) => Promise<R>);
}
