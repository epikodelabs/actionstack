import { map, mergeMap } from '@epikodelabs/streamix';
import type { Stream } from '@epikodelabs/streamix';

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
 * Creates a stream from a selector and a state stream.
 *
 * @param selector - A selector function used to derive a value from the state.
 * @param stateStream - The source stream of state values.
 */
export function selectStream<T, R>(
  selector: Selector<T, R>,
  stateStream: Stream<T>
): Stream<R> {
  return stateStream.pipe(map((state) => selector(state)));
}

/**
 * Creates a stream from an async selector and a state stream.
 *
 * @param selector - An async selector function.
 * @param stateStream - The source stream of state values.
 */
export function selectStreamAsync<T, R>(
  selector: (state: T) => Promise<R>,
  stateStream: Stream<T>
): Stream<R> {
  return stateStream.pipe(mergeMap((state) => selector(state)));
}

