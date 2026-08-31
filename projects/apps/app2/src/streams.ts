// Demonstrates hooking Streamix into UI intent -> ActionStack store updates
import { atom, buffer, filter, map, pipe, tap, withLatestFrom } from '@epikodelabs/streamix';
import type { Subscription } from '@epikodelabs/streamix';
import { counter } from './store';

// UI intents
export const incrementClicks$ = atom<number>();
export const decrementClicks$ = atom<number>();
export const resetClicks$ = atom<number>();

// Streamed side effects (throttled/derived logic)
export let subscriptions: Subscription[] = [];

// Batch increment clicks within 200ms windows
subscriptions.push(
  pipe(
    incrementClicks$,
    buffer(200),
    filter((clicks) => clicks.length > 0),
    map((clicks) => clicks.reduce((sum, val) => sum + val, 0)),
    tap((total) => counter.actions.increment(total))
  ).subscribe(() => {}),



  // Only allow decrement if count > 9
  pipe(
    decrementClicks$,
    withLatestFrom(counter.data$.count()),
    filter(([, value]) => value > 9),
    tap(() => counter.actions.decrement(1))
  ).subscribe(() => {}),

  // Reset handler
  pipe(
    resetClicks$,
    tap(() => counter.actions.reset())
  ).subscribe(() => {})
);

