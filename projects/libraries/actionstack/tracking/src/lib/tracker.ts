import { CancelablePromise } from "@epikodelabs/actionstack";
import { ExtendedValueTracer, TracerSubscriptionEventHandlers } from "@epikodelabs/actionstack/tracking";
import { Subscription } from "@epikodelabs/streamix";

export interface Tracker {
  track(subscription: Subscription): void;
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
  private tracer: ExtendedValueTracer;
  private counts = new Map<string, number>();
  private activeWaits: Array<{ resolve: () => void; reject: (e: Error) => void; timer: any }> = [];
  private observerUnsubs = new Map<string, () => void>();
  public timeout: number;

  constructor(tracer: ExtendedValueTracer, options: TrackerOptions = {}) {
    this.tracer = tracer;
    this.timeout = options.timeout || 5000;
  }

  private getSubId(sub: Subscription): string {
    const s = sub as any;
    // Support multiple possible shapes produced by different runtime builds
    return (
      s.subscriptionId ||
      s.id ||
      s.subId ||
      s.subscription?.subscriptionId ||
      s.subscription?.id ||
      s.iteratorId ||
      s._subscriptionId ||
      s["subscription"]?.id ||
      undefined
    );
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

  private updateCount(subId: string, delta: number) {
    if (!subId) return;
    const current = this.counts.get(subId) ?? 0;
    let next = current;
    if (delta < 0) {
      // Only decrement if current is greater than zero
      if (current > 0) {
        next = current + delta;
        if (next < 0) next = 0;
      }
    } else {
      next = current + delta;
    }
    this.counts.set(subId, next);
    this.checkResolution();
  }

  track(subscription: Subscription): void {
    const subId = this.getSubId(subscription);
    if (!subId) return;
    // Always set count to 0 when tracking (idempotent)
    this.counts.set(subId, 0);
    if (!this.observerUnsubs.has(subId)) {
      const handlers: TracerSubscriptionEventHandlers = {
        emitted: () => this.updateCount(subId, 1),
        delivered: () => this.updateCount(subId, -1),
        filtered: () => this.updateCount(subId, -1),
        collapsed: () => this.updateCount(subId, -1),
        dropped: () => this.updateCount(subId, -1),
        complete: () => {
          this.counts.delete(subId);
          this.observerUnsubs.get(subId)?.();
          this.observerUnsubs.delete(subId);
          this.checkResolution();
        }
      };
      const unsub = this.tracer.observeSubscription(subId, handlers);
      this.observerUnsubs.set(subId, unsub);
    }
  }

  state(subscription: Subscription): boolean {
    const subId = this.getSubId(subscription);
    return (this.counts.get(subId) ?? 0) > 0;
  }

  signal(subscription: Subscription): void {
    const subId = this.getSubId(subscription);
    // Only signal if already tracked (no-op for untracked subscriptions)
    if (!this.observerUnsubs.has(subId)) {
      return;
    }
    // Always set count to at least 1
    this.counts.set(subId, Math.max(1, this.counts.get(subId) ?? 0));
    this.checkResolution();
  }

  complete(subscription: Subscription): void {
    const subId = this.getSubId(subscription);
    if (!subId) return;
    this.tracer.completeSubscription(subId);
    // Logic inside Tracer.completeSubscription triggers the 'complete' handler above
    // Defensive: also clear counts in case tracer doesn't trigger complete
    this.counts.delete(subId);
    this.observerUnsubs.get(subId)?.();
    this.observerUnsubs.delete(subId);
    this.checkResolution();
  }

  cancelAll(): void {
    this.activeWaits.forEach(w => clearTimeout(w.timer));
    this.activeWaits = [];
  }

  reset(): void {
    this.cancelAll();
    // Instead of removing handlers, just zero all counts
    for (const subId of this.counts.keys()) {
      this.counts.set(subId, 0);
    }
    this.checkResolution();
    // Optionally clear tracer state if needed, but keep handlers
    this.tracer.clear();
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
    };

    return promise;
  }
}

export const createTracker = (tracer: ExtendedValueTracer, options?: TrackerOptions): Tracker => {
  return new TrackerImpl(tracer, options);
};