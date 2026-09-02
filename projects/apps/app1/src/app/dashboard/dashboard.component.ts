import { CommonModule } from '@angular/common';
import type { OnDestroy, OnInit } from '@angular/core';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import type { Atom } from '@epikodelabs/streamix';
import { store } from '../app.module';
import { AtomDirective } from '../atom.directive';
import type { Hero } from '../hero';
import { dashboardModule } from './dashboard.slice';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: [ './dashboard.component.css' ],
  standalone: true,
  imports: [CommonModule, RouterModule, AtomDirective],
})
export class DashboardComponent implements OnInit, OnDestroy {
  heroes: Atom<Hero[]> = dashboardModule.data$.selectTopHeroes();

  constructor() {}

  async ngOnInit() {
    await store.loadModule(dashboardModule);

    dashboardModule.actions.loadHeroes();
  }

  ngOnDestroy(): void {
    void store.unloadModule(dashboardModule, true);
  }
}
