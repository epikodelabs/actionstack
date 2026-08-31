import {
  Directive,
  EmbeddedViewRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  TemplateRef,
  ViewContainerRef,
  inject,
} from '@angular/core';
import type { DependencySource, Subscription } from '@epikodelabs/streamix';

type AtomTrackByFunction<T> = (index: number, item: T) => unknown;

interface AtomContext<T = unknown> {
  $implicit: T;
  atom: T;
  atomOf?: readonly T[];
  index: number;
  count: number;
  first: boolean;
  last: boolean;
  even: boolean;
  odd: boolean;
}

interface CollectionView<T> {
  key: unknown;
  viewRef: EmbeddedViewRef<AtomContext<T>>;
}

type PendingRender<T> =
  | { kind: 'value'; value: T | undefined }
  | { kind: 'collection'; value: Iterable<T> | undefined };

/**
 * Binds a Streamix-compatible reactive source to an Angular template context.
 *
 * Initial rendering is synchronous. Subsequent reactive emissions are
 * coalesced to at most one render per animation frame; the latest value wins.
 *
 * Collection rendering reuses/moves existing embedded views instead of
 * clearing and recreating the whole collection on every emission.
 */
@Directive({
  selector: '[atom]',
  standalone: true,
})
export class AtomDirective<T = unknown> implements OnChanges, OnDestroy {
  private readonly templateRef = inject<TemplateRef<AtomContext<T>>>(TemplateRef);
  private readonly viewContainerRef = inject(ViewContainerRef);

  private unsubscribe?: Subscription;
  private valueViewRef?: EmbeddedViewRef<AtomContext<T>>;
  private renderedValue: unknown = UNSET;
  private collectionViews: CollectionView<T>[] = [];

  private pendingRender?: PendingRender<T>;
  private scheduledFrame?: number;
  private destroyed = false;

  @Input()
  atom: AtomInput<T> | null | undefined;

  @Input()
  atomOf: AtomInput<Iterable<T>> | null | undefined;

  /** Used by `*atom="let item of items; trackBy: trackItem"`. */
  @Input()
  atomTrackBy?: AtomTrackByFunction<T>;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['atom'] && !changes['atomOf'] && !changes['atomTrackBy']) {
      return;
    }

    if (this.atomOf !== undefined && this.atomOf !== null) {
      this.bindCollection(this.atomOf);
      return;
    }

    this.bindValue(this.atom);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.unbind();
    this.clearValueView();
    this.clearCollectionViews();
  }

  private bindValue(source: AtomInput<T> | null | undefined): void {
    this.unbind();
    this.clearCollectionViews();

    if (isDependencySource<T>(source)) {
      this.renderValue(source.value);
      this.unsubscribe = source.subscribe((value) => this.scheduleValue(value));
      return;
    }

    this.renderValue(source === null ? undefined : source);
  }

  private bindCollection(source: AtomInput<Iterable<T>> | null | undefined): void {
    this.unbind();
    this.clearValueView();

    if (isDependencySource<Iterable<T>>(source)) {
      this.renderCollection(source.value);
      this.unsubscribe = source.subscribe((value) => this.scheduleCollection(value));
      return;
    }

    this.renderCollection(source === null ? undefined : source);
  }

  private unbind(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.cancelScheduledRender();
    this.pendingRender = undefined;
  }

  private scheduleValue(value: T): void {
    this.pendingRender = { kind: 'value', value };
    this.scheduleFrame();
  }

  private scheduleCollection(value: Iterable<T> | undefined): void {
    this.pendingRender = { kind: 'collection', value };
    this.scheduleFrame();
  }

  private scheduleFrame(): void {
    if (this.scheduledFrame !== undefined || this.destroyed) {
      return;
    }

    const raf = globalThis.requestAnimationFrame;
    if (typeof raf === 'function') {
      this.scheduledFrame = raf(() => {
        this.scheduledFrame = undefined;
        this.flushPendingRender();
      });
      return;
    }

    // SSR / non-browser fallback. Keep the same "no faster than a frame" intent.
    this.scheduledFrame = globalThis.setTimeout(() => {
      this.scheduledFrame = undefined;
      this.flushPendingRender();
    }, 16) as unknown as number;
  }

  private cancelScheduledRender(): void {
    if (this.scheduledFrame === undefined) {
      return;
    }

    if (typeof globalThis.cancelAnimationFrame === 'function') {
      globalThis.cancelAnimationFrame(this.scheduledFrame);
    } else {
      globalThis.clearTimeout(this.scheduledFrame);
    }

    this.scheduledFrame = undefined;
  }

  private flushPendingRender(): void {
    if (this.destroyed) {
      this.pendingRender = undefined;
      return;
    }

    const pending = this.pendingRender;
    this.pendingRender = undefined;
    if (!pending) return;

    if (pending.kind === 'value') {
      this.renderValue(pending.value);
    } else {
      this.renderCollection(pending.value);
    }
  }

  private renderValue(value: T | undefined): void {
    if (Object.is(this.renderedValue, value)) {
      return;
    }

    this.renderedValue = value;

    if (value === undefined) {
      this.clearValueView();
      return;
    }

    if (!this.valueViewRef) {
      this.valueViewRef = this.viewContainerRef.createEmbeddedView(
        this.templateRef,
        createValueContext(value)
      );
      return;
    }

    const context = this.valueViewRef.context;
    context.$implicit = value;
    context.atom = value;
    context.atomOf = undefined;
    context.index = 0;
    context.count = 1;
    context.first = true;
    context.last = true;
    context.even = true;
    context.odd = false;
    this.valueViewRef.detectChanges();
  }

  private renderCollection(source: Iterable<T> | undefined): void {
    if (source === undefined) {
      this.clearCollectionViews();
      return;
    }

    const items = Array.isArray(source) ? source : Array.from(source);
    const count = items.length;
    const trackBy = this.atomTrackBy ?? identityTrackBy;

    const available = new Map<unknown, CollectionView<T>[]>();
    for (const record of this.collectionViews) {
      const bucket = available.get(record.key);
      if (bucket) bucket.push(record);
      else available.set(record.key, [record]);
    }

    const nextViews: CollectionView<T>[] = [];

    for (let index = 0; index < count; index += 1) {
      const item = items[index];
      const key = trackBy(index, item);
      const bucket = available.get(key);
      const record = bucket?.shift();

      if (bucket && bucket.length === 0) {
        available.delete(key);
      }

      if (record) {
        this.updateCollectionContext(record.viewRef, items, item, index, count);

        const currentIndex = this.viewContainerRef.indexOf(record.viewRef);
        if (currentIndex !== index) {
          this.viewContainerRef.move(record.viewRef, index);
        }

        record.key = key;
        nextViews.push(record);
        continue;
      }

      const viewRef = this.viewContainerRef.createEmbeddedView(
        this.templateRef,
        createCollectionContext(items, item, index, count),
        { index }
      );

      nextViews.push({ key, viewRef });
    }

    for (const bucket of available.values()) {
      for (const record of bucket) {
        const index = this.viewContainerRef.indexOf(record.viewRef);
        if (index >= 0) {
          this.viewContainerRef.remove(index);
        } else {
          record.viewRef.destroy();
        }
      }
    }

    this.collectionViews = nextViews;
  }

  private updateCollectionContext(
    viewRef: EmbeddedViewRef<AtomContext<T>>,
    items: readonly T[],
    item: T,
    index: number,
    count: number
  ): void {
    const context = viewRef.context;
    const first = index === 0;
    const last = index === count - 1;
    const even = index % 2 === 0;
    const odd = !even;

    const changed =
      !Object.is(context.$implicit, item) ||
      context.atomOf !== items ||
      context.index !== index ||
      context.count !== count ||
      context.first !== first ||
      context.last !== last ||
      context.even !== even ||
      context.odd !== odd;

    if (!changed) return;

    context.$implicit = item;
    context.atom = item;
    context.atomOf = items;
    context.index = index;
    context.count = count;
    context.first = first;
    context.last = last;
    context.even = even;
    context.odd = odd;
    viewRef.detectChanges();
  }

  private clearValueView(): void {
    if (!this.valueViewRef) {
      this.renderedValue = UNSET;
      return;
    }

    const index = this.viewContainerRef.indexOf(this.valueViewRef);
    if (index >= 0) this.viewContainerRef.remove(index);
    else this.valueViewRef.destroy();

    this.valueViewRef = undefined;
    this.renderedValue = UNSET;
  }

  private clearCollectionViews(): void {
    if (this.collectionViews.length === 0) return;
    this.viewContainerRef.clear();
    this.collectionViews = [];
  }

  static ngTemplateContextGuard<T>(
    _directive: AtomDirective<T>,
    _context: unknown
  ): _context is AtomContext<T> {
    return true;
  }
}

type AtomInput<T> = DependencySource<T> | T;
const UNSET = Symbol('atom-directive-unset');

function identityTrackBy<T>(_index: number, item: T): unknown {
  return item;
}

function createValueContext<T>(value: T): AtomContext<T> {
  return {
    $implicit: value,
    atom: value,
    atomOf: undefined,
    index: 0,
    count: 1,
    first: true,
    last: true,
    even: true,
    odd: false,
  };
}

function createCollectionContext<T>(
  items: readonly T[],
  item: T,
  index: number,
  count: number
): AtomContext<T> {
  return {
    $implicit: item,
    atom: item,
    atomOf: items,
    index,
    count,
    first: index === 0,
    last: index === count - 1,
    even: index % 2 === 0,
    odd: index % 2 !== 0,
  };
}

function isDependencySource<T>(
  value: AtomInput<T> | null | undefined
): value is DependencySource<T> {
  return !!value &&
    typeof value === 'object' &&
    'subscribe' in value &&
    'value' in value &&
    typeof value.subscribe === 'function';
}
