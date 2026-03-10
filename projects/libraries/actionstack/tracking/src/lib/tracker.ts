import { CancelablePromise } from "@epikodelabs/actionstack";
import { Subscription } from "@epikodelabs/streamix";

export interface Tracker {
  track(subscription: Subscription): void;
  start(subscription: Subscription): void;
  finish(subscription: Subscription): void;
  state(subscription: Subscription): boolean;
  signal(subscription: Subscription): void;
  complete(subscription: Subscription): void;
  reset(): void;
  waitAll(): CancelablePromise<void>;
  cancelAll(): void;
  timeout: number;
}

export interface TrackerOptions {
  timeout?: number;
}

class TrackerImpl implements Tracker {
  private counts = new Map<Subscription, number>();
  private activeWaits: Array<{ resolve: () => void; reject: (e: Error) => void; timer: any }> = [];
  public timeout: number;

  constructor(options: TrackerOptions = {}) {
    this.timeout = options.timeout || 5000;
  }

  private get totalPending(): number {
    let total = 0;
    for (const count of this.counts.values()) {
      total += count;
    }
    return total;
  }

  private checkResolution() {
    if (this.totalPending === 0 && this.activeWaits.length > 0) {
      const waits = [...this.activeWaits];
      this.activeWaits = [];
      waits.forEach(w => {
        clearTimeout(w.timer);
        w.resolve();
      });
    }
  }

  private updateCount(subscription: Subscription, delta: number) {
    const current = this.counts.get(subscription) ?? 0;
    let next = current;
    if (delta < 0) {
      if (current > 0) {
        next = current + delta;
        if (next < 0) next = 0;
      }
    } else {
      next = current + delta;
    }
    this.counts.set(subscription, next);
    this.checkResolution();
  }

  track(subscription: Subscription): void {
    if (!this.counts.has(subscription)) {
      this.counts.set(subscription, 0);
    }
  }

  start(subscription: Subscription): void {
    this.track(subscription);
    this.updateCount(subscription, 1);
  }

  finish(subscription: Subscription): void {
    if (!this.counts.has(subscription)) return;
    this.updateCount(subscription, -1);
  }

  state(subscription: Subscription): boolean {
    return (this.counts.get(subscription) ?? 0) > 0;
  }

  signal(subscription: Subscription): void {
    this.start(subscription);
  }

  complete(subscription: Subscription): void {
    this.counts.delete(subscription);
    this.checkResolution();
  }

  cancelAll(): void {
    this.activeWaits.forEach(w => {
      clearTimeout(w.timer);
      w.resolve();
    });
    this.activeWaits = [];
  }

  reset(): void {
    this.cancelAll();
    for (const subscription of this.counts.keys()) {
      this.counts.set(subscription, 0);
    }
    this.checkResolution();
  }

  waitAll(): CancelablePromise<void> {
    if (this.totalPending === 0) {
      const p = Promise.resolve() as any;
      p.cancel = () => {};
      return p;
    }

    let waitEntry: any;
    let finished = false;
    const promise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (finished) return;
        finished = true;
        const idx = this.activeWaits.indexOf(waitEntry);
        if (idx > -1) {
          this.activeWaits.splice(idx, 1);
        }
        reject(new Error(`Tracker timeout after ${this.timeout}ms`));
      }, this.timeout);

      waitEntry = { resolve: () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve();
      }, reject: (e: Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        reject(e);
      }, timer };
      this.activeWaits.push(waitEntry);
    }) as CancelablePromise<void>;

    promise.cancel = () => {
      if (finished) return;
      finished = true;
      clearTimeout(waitEntry.timer);
      const idx = this.activeWaits.indexOf(waitEntry);
      if (idx > -1) this.activeWaits.splice(idx, 1);
      waitEntry.resolve();
    };

    return promise;
  }
}

function isTrackerOptions(value: unknown): value is TrackerOptions {
  return !!value && typeof value === "object" && "timeout" in (value as Record<string, unknown>);
}

export const createTracker = (
  tracerOrOptions?: unknown,
  options?: TrackerOptions
): Tracker => {
  const resolvedOptions = isTrackerOptions(tracerOrOptions) ? tracerOrOptions : options;
  return new TrackerImpl(resolvedOptions);
};