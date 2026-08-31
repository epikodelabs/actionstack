
import { CommonModule } from '@angular/common';
import type { OnInit } from '@angular/core';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { registerModule } from '@epikodelabs/actionstack';
import type { Stream } from '@epikodelabs/streamix';
import { store } from '../app.module';
import type { Hero } from '../hero';
import { dashboardModule } from './dashboard.slice';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: [ './dashboard.component.css' ],
  standalone: true,
  imports: [CommonModule, RouterModule],
})
export class DashboardComponent implements OnInit {
  heroes$!: Stream<Hero[]>;

  constructor() {
    registerModule(store, dashboardModule);
  }

  async ngOnInit() {
    this.heroes$ = dashboardModule.data$.selectTopHeroes();
    dashboardModule.actions.loadHeroes();
  }

  ngOnDestroy(): void {
  }
}

