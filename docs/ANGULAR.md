# Angular

Angular does not need a renderer abstraction to work nicely with `actionstack`.

The simplest path is:

- expose a Streamix stream from `module.data$`
- bind it in the template with Angular's `async` pipe
- keep `registerModule(...)` and `unregisterModule(...)` at the component boundary

That is already the cleanest fit for most components because Angular owns subscription lifecycle and change detection for us.

## Preferred Pattern

```ts
import type { OnDestroy, OnInit } from '@angular/core';
import { Component } from '@angular/core';
import { registerModule, unregisterModule } from '@epikodelabs/actionstack';
import type { Stream } from '@epikodelabs/streamix';

import { store } from '../app.module';
import type { Hero } from '../hero';
import { heroesModule } from './heroes.slice';

@Component({
  selector: 'app-heroes',
  templateUrl: './heroes.component.html',
  styleUrls: ['./heroes.component.css'],
  standalone: false
})
export class HeroesComponent implements OnInit, OnDestroy {
  heroes$!: Stream<Hero[]>;

  constructor() {
    registerModule(store, heroesModule);
  }

  ngOnInit(): void {
    this.heroes$ = heroesModule.data$.selectHeroes();
    heroesModule.actions.getHeroesRequest({ heroes: [] });
  }

  ngOnDestroy(): void {
    unregisterModule(store, heroesModule, true);
  }
}
```

```html
<ul *ngIf="heroes$ | async as heroes">
  <li *ngFor="let hero of heroes">{{ hero.name }}</li>
</ul>
```

## When Manual Subscription Is Still Needed

If a component must subscribe imperatively, `ChangeDetectorRef` is the right integration point.

`Renderer2` is usually heavier than necessary because the real issue is not DOM mutation, it is notifying Angular that external stream emissions changed component state.

Use this shape:

```ts
import { ChangeDetectorRef, DestroyRef, inject } from '@angular/core';

const cdr = inject(ChangeDetectorRef);
const destroyRef = inject(DestroyRef);

someModule.attachView(cdr);

const sub = someModule.data$.someSelector().subscribe((value) => {
  this.value = value;
});

destroyRef.onDestroy(() => {
  someModule.detachView(cdr);
  sub.unsubscribe();
});
```

`attachView()` accepts:

- a `ChangeDetectorRef`-like object with `markForCheck()`
- a `ChangeDetectorRef`-like object with `detectChanges()`
- a plain callback function

If you need the DOM updated in the same turn, attach an object that uses `detectChanges()`, but `markForCheck()` should stay the default for Angular components.

## Proposal For Both v3 And v4

The Angular recommendation can stay the same across both lifecycle versions:

- `v3`: attach `ChangeDetectorRef` with `module.attachView(cdr)` whenever component state is updated from a manual `data$` subscription
- `v4`: do the same, and also respect the stronger module destruction lifecycle that now exposes in-progress teardown behavior

That gives us one Angular-facing story:

- prefer `async` pipe first
- fall back to manual subscription plus `cdr`
- do not introduce a renderer layer unless we have a real DOM-level requirement

## Version Notes

### v3

`v3` works well with either:

- template binding via `async`
- manual subscription plus `module.attachView(cdr)`

The important part is that Angular change detection should be attached at the component edge, not pushed down into store or module internals.

### v4

`v4` keeps the same Angular binding advice, but adds safer teardown semantics in the module lifecycle. That means Angular helpers should avoid reconfiguring or dispatching against modules that are already destroying or destroyed.

In other words, `v4` does not need a different rendering strategy. It just benefits from the same `attachView(cdr)` integration plus the newer lifecycle guards.
