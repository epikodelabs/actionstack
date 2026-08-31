import { createSharedSource } from '@epikodelabs/streamix';
import type { Atom } from '@epikodelabs/streamix';

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
 * Creates an atom from a selector and a state atom.
 *
 * The returned atom emits the selector applied to the current state when the
 * first subscriber attaches, then re-emits whenever the state atom changes.
 *
 * @param selector - A selector function used to derive a value from the state.
 * @param stateAtom - The source atom of state values.
 */
export function selectStream<T, R>(
  selector: Selector<T, R>,
  stateAtom: Atom<T>
): Atom<R> {
  return createSharedSource<R>(async (push) => {
    await push(selector(stateAtom.value));

    const sourceSubscription = stateAtom.subscribe((state: T) => {
      void push(selector(state));
    });

    return () => {
      sourceSubscription();
    };
  });
}

/**
 * Creates an atom from an async selector and a state atom.
 *
 * The returned atom emits the awaited selector result for the current state
 * when the first subscriber attaches, then follows state changes. Selector
 * rejections are logged as warnings and resolve to `undefined`.
 *
 * @param selector - An async selector function.
 * @param stateAtom - The source atom of state values.
 */
export function selectStreamAsync<T, R>(
  selector: (state: T) => Promise<R>,
  stateAtom: Atom<T>
): Atom<R> {
  const resolve = async (state: T): Promise<R | undefined> => {
    try {
      return await selector(state);
    } catch (err: any) {
      console.warn(`Error in async selector: ${err?.message ?? err}`);
      return undefined;
    }
  };

  return createSharedSource<R>(async (push) => {
    await push((await resolve(stateAtom.value)) as R);

    const sourceSubscription = stateAtom.subscribe((state: T) => {
      void resolve(state).then((value) => push(value as R));
    });

    return () => {
      sourceSubscription();
    };
  });
}

