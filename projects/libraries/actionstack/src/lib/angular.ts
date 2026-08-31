import { DestroyRef, NgZone, inject, signal } from '@angular/core';
import type { Signal, WritableSignal } from '@angular/core';
import type { Atom } from '@epikodelabs/streamix';

export interface AtomToSignalOptions<T> {
  initialValue?: T;
  destroyRef?: DestroyRef;
  zone?: NgZone;
  onError?: (error: unknown) => void;
}

function tryInjectDestroyRef(): DestroyRef | undefined {
  try {
    return inject(DestroyRef);
  } catch {
    return undefined;
  }
}

function tryInjectZone(): NgZone | undefined {
  try {
    return inject(NgZone);
  } catch {
    return undefined;
  }
}

export function atomToSignal<T>(
  source: Atom<T>,
  options: AtomToSignalOptions<T> = {}
): Signal<T | undefined> {
  const state: WritableSignal<T | undefined> = signal(options.initialValue);
  const zone = options.zone ?? tryInjectZone();
  const unsubscribe = source.subscribe((value) => {
    if (zone) {
      zone.run(() => {
        state.set(value);
      });
      return;
    }

    state.set(value);
  });

  const unsubscribeError =
    typeof (source as any).onError === 'function'
      ? (source as any).onError((error: unknown) => {
          if (zone) {
            zone.run(() => {
              if (options.onError) {
                options.onError(error);
                return;
              }

              console.error(error);
            });
            return;
          }

          if (options.onError) {
            options.onError(error);
            return;
          }

          console.error(error);
        })
      : undefined;

  const destroyRef = options.destroyRef ?? tryInjectDestroyRef();
  destroyRef?.onDestroy(() => {
    unsubscribe();
    if (typeof unsubscribeError === 'function') {
      unsubscribeError();
    }
  });

  return state.asReadonly();
}
