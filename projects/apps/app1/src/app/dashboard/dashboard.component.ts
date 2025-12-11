
import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Hero } from '../hero';
import { dashboardModule} from './dashboard.slice';
import { store } from '../app.module';
import { Stream } from '@actioncrew/streamix';
import { registerModule } from 'projects/libraries/actionstack/src/lib/module';

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
