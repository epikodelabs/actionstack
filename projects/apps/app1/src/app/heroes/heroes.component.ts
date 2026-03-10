
import type { OnDestroy, OnInit } from '@angular/core';
import { Component } from '@angular/core';

import { registerModule, unregisterModule } from '@epikodelabs/actionstack';
import type { Subscription } from '@epikodelabs/streamix';
import { store } from '../app.module';
import type { Hero } from '../hero';
import { HeroService } from './../hero.service';
import { heroesModule } from './heroes.slice';

@Component({
  selector: 'app-heroes',
  templateUrl: './heroes.component.html',
  styleUrls: ['./heroes.component.css'],
  standalone: false
})
export class HeroesComponent implements OnInit, OnDestroy {
  heroes: Hero[] = [];
  subscription!: Subscription;


  constructor(private heroService: HeroService) {
    registerModule(store, heroesModule);
  }

  async ngOnInit() {

    heroesModule.data$.selectHeroes().subscribe(value => {
      this.heroes = value;
    });

    this.getHeroes();
  }

  getHeroes(): void {
    heroesModule.actions.getHeroesRequest({ heroes: this.heroes });
  }

  ngOnDestroy(): void {
    unregisterModule(store, heroesModule, true);
  }
}

