/**
 * A selector extracts a value from state.
 */
export type Selector<T, R> = (state: T) => R;

/**
 * Helper types for inference
 */
type AnySelector = (state: any) => any;

type StateOf<F> =
  F extends (state: infer S) => any ? S : never;

type ResultOf<F> =
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
 * Creates a selector that extracts a property from state.
 * Supports both simple keys and nested paths.
 */
export function createFeatureSelector<
  T,
  P extends keyof T | readonly (keyof T)[]
>(
  keyOrPath: P
): Selector<
  T,
  P extends keyof T
    ? T[P]
    : P extends readonly (keyof T)[]
      ? ValueAtPath<T, P>
      : unknown
> {
  return (state: T) => {
    if (Array.isArray(keyOrPath)) {
      return keyOrPath.reduce<any>(
        (acc, key) => (acc == null ? undefined : acc[key]),
        state
      );
    }

    return (state as any)[keyOrPath];
  };
}

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
  Fns extends readonly [AnySelector, ...AnySelector[]]
>(
  ...fns: Fns
): Selector<
  StateOf<Fns[0]>,
  Fns extends readonly [infer Only]
    ? ResultOf<Only>
    : Fns extends readonly [...infer _, infer Projector]
      ? Projector extends (...args: any[]) => infer R
        ? R
        : never
      : never
> {
  // Single selector → projection / identity
  if (fns.length === 1) {
    return fns[0] as any;
  }

  // Derived selector
  const projector = fns[fns.length - 1] as (...args: any[]) => any;
  const inputs = fns.slice(0, -1) as AnySelector[];

  return ((state: any) => {
    const values = inputs.map(sel => sel(state));
    return projector(...values);
  }) as any;
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
  Fns extends readonly [AnySelector, ...AnySelector[]]
>(
  ...fns: Fns
): (state: StateOf<Fns[0]>) => Promise<
  Fns extends readonly [infer Only]
    ? ResultOf<Only>
    : Fns extends readonly [...infer _, infer Projector]
      ? Projector extends (...args: any[]) => infer R
        ? R
        : never
      : never
> {
  // Single selector → async projection
  if (fns.length === 1) {
    const sel = fns[0] as AnySelector;
    return async (state: any) => sel(state);
  }

  const projector = fns[fns.length - 1] as (...args: any[]) => any;
  const inputs = fns.slice(0, -1) as AnySelector[];

  return async (state: any) => {
    const values = inputs.map(sel => sel(state));
    return await projector(...values);
  };
}

/**
 * Alias helpers (semantic sugar).
 */
export const featureSelector = createFeatureSelector;