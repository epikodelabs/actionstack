import type { OnDestroy, OnInit } from '@angular/core';
import { ChangeDetectorRef, Component, inject } from '@angular/core';

import { unregisterModule } from '@epikodelabs/actionstack';
import type { Atom } from '@epikodelabs/streamix';
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
  heroes?: Atom<Hero[]>;
  private readonly changeDetector = inject(ChangeDetectorRef);

  constructor() {}

  async ngOnInit() {
    await store.loadModule(heroesModule);
    this.heroes = heroesModule.data$.selectHeroes();
    this.changeDetector.markForCheck();

    this.getHeroes();
  }

  getHeroes(): void {
    heroesModule.actions.getHeroesRequest({ heroes: [] });
  }

  ngOnDestroy(): void {
    unregisterModule(store, heroesModule, true);
  }
}
