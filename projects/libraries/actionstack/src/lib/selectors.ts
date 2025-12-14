import {
  MaybePromise,
  createReceiver,
  createSubscription,
  Receiver,
  Stream,
  StrictReceiver,
  Subscription,
  mergeMap,
  map,
} from '@actioncrew/streamix';
import { Tracker } from './tracker';
import { trackable } from './trackable';

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
export function createFeatureSelector<
  T,
  P extends keyof T | readonly any[]
>(
  keyOrPath: P
): Selector<
  T,
  P extends keyof T
    ? T[P]
    : P extends readonly any[]
      ? ValueAtPath<T, P>
      : unknown
> {
  return (state: T) => {
    if (state == null) {
      return undefined as any;
    }

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
 * Note: Tracker is attached via processSelectors during module configuration.
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
  // Single selector → projection / identity
  if (fns.length === 1) {
    return fns[0];
  }

  // Derived selector
  const projector = fns[fns.length - 1];
  const inputs = fns.slice(0, -1);

  return (state: any) => {
    const values = inputs.map((sel: any) => sel(state));
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
 * Note: Tracker is attached via processSelectors during module configuration.
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
  // Single selector → async projection
  if (fns.length === 1) {
    const sel = fns[0];
    return async (state: any) => sel(state);
  }

  const projector = fns[fns.length - 1];
  const inputs = fns.slice(0, -1);

  return async (state: any) => {
    const values = inputs.map((sel: any) => sel(state));
    return await projector(...values);
  };
}

/**
 * Creates a trackable stream from a selector and a state stream.
 * The resulting stream will be automatically tracked using the selector's
 * attached tracker.
 *
 * @param selector - A selector with an attached tracker
 * @param stateStream - The source stream of state values
 * @returns A stream that emits selected values, automatically tracked
 */
export function selectStream<T, R>(
  selector: TrackableSelector<T, R>,
  stateStream: Stream<T>
): Stream<R> {
  // Map the state stream through the selector
  const selectedStream = stateStream.pipe(map(state => selector(state)));

  // Wrap the stream with the selector's tracker
  return trackable(selectedStream, selector._tracker);
}

/**
 * Creates a trackable stream from an async selector and a state stream.
 * The resulting stream will be automatically tracked using the selector's
 * attached tracker.
 *
 * @param selector - An async selector with an attached tracker
 * @param stateStream - The source stream of state values
 * @returns A stream that emits selected values, automatically tracked
 */
export function selectStreamAsync<T, R>(
  selector: ((state: T) => Promise<R>) & { _tracker: Tracker },
  stateStream: Stream<T>
): Stream<R> {
  // Map the state stream through the async selector
  const selectedStream = stateStream.pipe(mergeMap(async state => await selector(state)));

  // Wrap the stream with the selector's tracker
  return trackable(selectedStream, selector._tracker);
}

/**
 * Attaches a tracker to an async selector function.
 * This is useful when you need to manually create trackable async selectors
 * outside of the module system.
 *
 * @param tracker - The Tracker instance to attach
 * @param asyncSelector - The async selector function
 * @returns The async selector with tracker attached
 */
export function withAsyncTracker<T, R>(
  tracker: Tracker,
  asyncSelector: (state: T) => Promise<R>
): ((state: T) => Promise<R>) & { _tracker: Tracker } {
  (asyncSelector as any)._tracker = tracker;
  return asyncSelector as ((state: T) => Promise<R>) & { _tracker: Tracker };
}

/**
 * Alias helpers (semantic sugar).
 */
export const featureSelector = createFeatureSelector;