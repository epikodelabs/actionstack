
import { Component, OnDestroy, OnInit } from '@angular/core';

import { Hero } from '../hero';
import { HeroService } from './../hero.service';
import { heroesModule } from './heroes.slice';
import { store } from '../app.module';
import { Subscription } from '@actioncrew/streamix';
import { registerModule, unregisterModule } from '@actioncrew/actionstack';

@Component({
  selector: 'app-heroes',
  templateUrl: './heroes.component.html',
  styleUrls: ['./heroes.component.css']
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
    unregisterModule(store, true, heroesModule);
  }
}
