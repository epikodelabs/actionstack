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

  async ngOnInit() {
    this.heroes$ = heroesModule.data$.selectHeroes();
    this.getHeroes();
  }

  getHeroes(): void {
    heroesModule.actions.getHeroesRequest({ heroes: [] });
  }

  ngOnDestroy(): void {
    unregisterModule(store, heroesModule, true);
  }
}

