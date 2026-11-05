import { Injectable } from '@angular/core';

import type { Hero } from './hero';
import { HEROES } from './mock-heroes';

/**
 * Shared catalog behind every HeroService instance (each feature module
 * constructs its own). All reads return copies: committed store state is
 * frozen, so state must never alias the catalog.
 */
const CATALOG: Hero[] = HEROES.map((hero) => ({ ...hero }));

@Injectable({ providedIn: 'root' })
export class HeroService {
  timeout = 200;

  constructor() { }

  getHeroes(): Promise<Hero[]> {
    return new Promise<Hero[]>((resolve) => {
      setTimeout(() => {
        resolve(CATALOG.map((hero) => ({ ...hero })));
      }, this.timeout);
    });
  }

  getHero(id: number): Promise<Hero> {
    return new Promise<Hero>((resolve, reject) => {
      setTimeout(() => {
        const hero = CATALOG.find((item) => item.id === id);
        if (!hero) {
          reject(new Error(`HeroService: hero id=${id} not found`));
          return;
        }
        resolve({ ...hero });
      }, this.timeout);
    });
  }

  renameHero(id: number, name: string): Promise<Hero> {
    return new Promise<Hero>((resolve, reject) => {
      setTimeout(() => {
        const hero = CATALOG.find((item) => item.id === id);
        if (!hero) {
          reject(new Error(`HeroService: hero id=${id} not found`));
          return;
        }
        hero.name = name;
        resolve({ ...hero });
      }, this.timeout);
    });
  }
}
