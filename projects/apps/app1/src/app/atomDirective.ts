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

/**
 * Binds a Streamix-compatible reactive source to an Angular template context.
 *
 * @example
 * ```html
 * <ng-container *atom="count$ as count">{{ count }}</ng-container>
 * <li *atom="let hero of heroes$">{{ hero.name }}</li>
 * ```
 */
@Directive({
  selector: '[atom]',
  standalone: true,
})
export class AtomDirective<T = unknown> implements OnChanges, OnDestroy {
  private readonly templateRef = inject<TemplateRef<AtomContext>>(TemplateRef);
  private readonly viewContainerRef = inject(ViewContainerRef);

  private unsubscribe?: Subscription;
  private viewRef?: EmbeddedViewRef<AtomContext>;
  private readonly context: AtomContext = {
    $implicit: undefined,
    atom: undefined,
    atomOf: undefined,
    index: 0,
    count: 0,
    first: false,
    last: false,
    even: true,
    odd: false,
  };

  @Input()
  atom: AtomInput<any> | null | undefined;

  @Input()
  atomOf: AtomInput<Iterable<any>> | null | undefined;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['atom'] && !changes['atomOf']) {
      return;
    }

    if (changes['atomOf']) {
      this.bindCollection(this.atomOf);
      return;
    }

    this.bindValue(this.atom);
  }

  ngOnDestroy(): void {
    this.unbind();
  }

  private bindValue(source: AtomInput<any> | null | undefined): void {
    this.unbind();

    if (isDependencySource<any>(source)) {
      this.renderValue(source.value);

      this.unsubscribe = source.subscribe((value) => {
        this.renderValue(value);
      });

      return;
    }

    this.renderValue(source === null ? undefined : source);
  }

  private bindCollection(source: AtomInput<Iterable<any>> | null | undefined): void {
    this.unbind();

    if (isDependencySource<Iterable<any>>(source)) {
      this.renderCollection(source.value);

      this.unsubscribe = source.subscribe((value) => {
        this.renderCollection(value as Iterable<any>);
      });

      return;
    }

    this.renderCollection(source === null ? undefined : source);
  }

  private unbind(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private renderValue(value: any): void {
    this.context.$implicit = value;
    this.context.atom = value;
    this.context.atomOf = undefined;

    if (value === undefined) {
      this.viewContainerRef.clear();
      this.viewRef = undefined;
      return;
    }

    if (!this.viewRef) {
      this.viewRef = this.viewContainerRef.createEmbeddedView(
        this.templateRef,
        this.context
      );
    } else {
      this.viewRef.detectChanges();
    }
  }

  private renderCollection(source: Iterable<any> | undefined): void {
    this.viewContainerRef.clear();
    this.viewRef = undefined;

    if (source === undefined) {
      return;
    }

    const items = Array.isArray(source) ? source : Array.from(source);
    const count = items.length;

    for (let index = 0; index < count; index += 1) {
      const item = items[index];
      this.viewContainerRef.createEmbeddedView(this.templateRef, {
        $implicit: item,
        atom: item,
        atomOf: items,
        index,
        count,
        first: index === 0,
        last: index === count - 1,
        even: index % 2 === 0,
        odd: index % 2 !== 0,
      });
    }
  }

  static ngTemplateContextGuard(
    _directive: AtomDirective<unknown>,
    _context: unknown
  ): _context is AtomContext {
    return true;
  }
}

interface AtomContext {
  $implicit: any;
  atom: any;
  atomOf?: readonly any[];
  index: number;
  count: number;
  first: boolean;
  last: boolean;
  even: boolean;
  odd: boolean;
}

type AtomInput<T> = DependencySource<T> | T;

function isDependencySource<T>(value: AtomInput<T> | null | undefined): value is DependencySource<T> {
  return !!value &&
    typeof value === 'object' &&
    'subscribe' in value &&
    'value' in value &&
    typeof value.subscribe === 'function';
}
