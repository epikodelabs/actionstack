import { Injectable } from '@angular/core';

import type { Hero } from './hero';
import { HEROES } from './mock-heroes';

@Injectable({ providedIn: 'root' })
export class HeroService {
  timeout = 200;

  constructor() { }

  getHeroes(): Promise<Hero[]> {
    return new Promise<Hero[]>((resolve) => {
      setTimeout(() => {
        resolve(HEROES);
      }, this.timeout);
    });
  }

  getHero(id: number): Promise<Hero> {
    return new Promise<Hero>((resolve) => {
      setTimeout(() => {
        const hero = HEROES.find(h => h.id === id)!;
        resolve(hero);
      }, this.timeout);
    });
  }
}

