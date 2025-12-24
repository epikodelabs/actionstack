import { Injectable } from '@angular/core';

import type { Hero } from './hero';
import { HEROES } from './mock-heroes';
import { fromPromise } from '@epikodelabs/streamix';
import type { Stream } from '@epikodelabs/streamix';

@Injectable({ providedIn: 'root' })
export class HeroService {
  timeout = 200;

  constructor() { }

  getHeroes(): Stream<Hero[]> {
    return fromPromise(new Promise<Hero[]>((resolve) => {
      setTimeout(() => {
        resolve(HEROES);
      }, this.timeout);
    }));
  }

  getHero(id: number): Stream<Hero> {
    return fromPromise(new Promise<Hero>((resolve) => {
      setTimeout(() => {
        const hero = HEROES.find(h => h.id === id)!;
        resolve(hero);
      }, this.timeout);
    }));
  }
}

