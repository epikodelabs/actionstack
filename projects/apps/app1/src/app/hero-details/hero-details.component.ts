import { Location } from '@angular/common';
import { Component } from '@angular/core';
import type { OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import type { Hero } from '../hero';
import { loadHero, heroDetailsModule } from './hero-details.slice';
import type { heroSelector } from './hero-details.slice';
import { store } from '../app.module';
import type { Stream } from '@epikodelabs/streamix';
import { map, tap } from 'rxjs';
import type { Subscription } from 'rxjs';
import { registerModule } from 'projects/libraries/actionstack/src/lib/module';

@Component({
  selector: 'app-hero-details',
  templateUrl: './hero-details.component.html',
  styleUrls: [ './hero-details.component.css' ]
})
export class HeroDetailsComponent implements OnInit {
  hero$!: Stream<Hero | undefined>;
  subscription: Subscription | undefined;

  constructor(
    private route: ActivatedRoute,
    private location: Location
  ) {
    registerModule(store, heroDetailsModule);
  }

    async ngOnInit() {
      this.hero$ = heroDetailsModule.data$.heroSelector();

      this.subscription = this.route.paramMap
        .pipe(
          map((params) => Number(params.get('id'))),
          tap((id) => store.dispatch(loadHero(id)))
        )
        .subscribe();
  }

  goBack(): void {
    this.location.back();
  }

  ngOnDestroy() {
    if(this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}

