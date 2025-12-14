import { Tracker } from './tracker';

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
        : never
      : never;

/**
 * Represents a selector that can be tracked when used with streams.
 * Extends the base Selector type with a tracker property.
 */
export type TrackableSelector<T, R> = Selector<T, R> & {
  _tracker: Tracker;
};

/**
 * Creates a selector that extracts a property from state.
 * Supports both simple keys and nested paths.
 * Note: Tracker is attached via processSelectors during module configuration.
 */
export function createFeatureSelector<K extends keyof any>(
  key: K
): <T extends Record<K, any>>(state: T) => T[K];

export function createFeatureSelector<P extends readonly (keyof any)[]>(
  path: P
): <T>(state: T) => ValueAtPath<T, P>;

export function createFeatureSelector<T, K extends keyof T>(
  key: K
): Selector<T, T[K]>;

export function createFeatureSelector<T, P extends readonly (keyof any)[]>(
  path: P
): Selector<T, ValueAtPath<T, P>>;

export function createFeatureSelector<T, P extends keyof T | readonly (keyof any)[]>(
  keyOrPath: P
): any {
  return (state: any) => {
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
 * Helper type for extracting parameter types from selector functions
 */
type SelectorResults<T extends readonly AnySelector[]> = {
  [K in keyof T]: T[K] extends (state: any) => infer R ? R : never;
};

/**
 * Variadic selector creator.
 *
 * Rules:
 * - selector(fn)                     → projection / identity
 * - selector(a, projector)           → derived
 * - selector(a, b, projector)        → derived
 *
 * The state type is inferred from the FIRST selector.
 * Note: Tracker is attached via processSelectors during module configuration.
 */

// Single selector (identity/projection)
export function selector<S, R>(
  selectorFn: Selector<S, R>
): Selector<S, R>;

// Selector with projector
export function selector<S, A, R>(
  selector1: Selector<S, A>,
  projector: (a: A) => R
): Selector<S, R>;

// Two selectors with projector
export function selector<S, A, B, R>(
  selector1: Selector<S, A>,
  selector2: Selector<S, B>,
  projector: (a: A, b: B) => R
): Selector<S, R>;

// Three selectors with projector
export function selector<S, A, B, C, R>(
  selector1: Selector<S, A>,
  selector2: Selector<S, B>,
  selector3: Selector<S, C>,
  projector: (a: A, b: B, c: C) => R
): Selector<S, R>;

// Generic variadic version (implementation signature)
export function selector(
  ...args: any[]
): any;

export function selector(
  ...fns: any[]
): any {
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
 */

// Single async selector
export function selectorAsync<S, R>(
  selectorFn: Selector<S, R>
): (state: S) => Promise<R>;

// Selector with async projector
export function selectorAsync<S, A, R>(
  selector1: Selector<S, A>,
  asyncProjector: (a: A) => Promise<R>
): (state: S) => Promise<R>;

// Two selectors with async projector
export function selectorAsync<S, A, B, R>(
  selector1: Selector<S, A>,
  selector2: Selector<S, B>,
  asyncProjector: (a: A, b: B) => Promise<R>
): (state: S) => Promise<R>;

// Generic variadic version (implementation signature)
export function selectorAsync(
  ...args: any[]
): any;

export function selectorAsync(
  ...fns: any[]
): any {
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