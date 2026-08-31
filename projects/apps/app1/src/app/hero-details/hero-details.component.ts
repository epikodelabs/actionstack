import { Location } from '@angular/common';
import type { OnDestroy, OnInit } from '@angular/core';
import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { unregisterModule } from '@epikodelabs/actionstack';
import type { Atom } from '@epikodelabs/streamix';
import { store } from '../app.module';
import type { Hero } from '../hero';
import { heroDetailsModule, loadHero } from './hero-details.slice';

@Component({
  selector: 'app-hero-details',
  templateUrl: './hero-details.component.html',
  styleUrls: [ './hero-details.component.css' ],
  standalone: false
})
export class HeroDetailsComponent implements OnInit, OnDestroy {
  hero: Atom<Hero | undefined> = heroDetailsModule.data$.heroSelector();

  constructor(
    private route: ActivatedRoute,
    private location: Location
  ) {}

  async ngOnInit() {
      await store.loadModule(heroDetailsModule);

      const id = Number(this.route.snapshot.paramMap.get('id'));
      store.dispatch(loadHero(id));
  }

  goBack(): void {
    this.location.back();
  }

  ngOnDestroy() {
    void store.unloadModule(heroDetailsModule, true);
  }
}
