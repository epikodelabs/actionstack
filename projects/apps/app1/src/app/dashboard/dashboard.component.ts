import type { OnDestroy, OnInit } from '@angular/core';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import type { Atom } from '@epikodelabs/streamix';
import { store } from '../app.module';
import { AtomDirective } from '../atom.directive';
import type { Hero } from '../hero';
import { heroHue, heroInitials } from '../hero-presentation';
import { dashboardModule } from './dashboard.slice';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
  standalone: true,
  imports: [RouterModule, AtomDirective],
})
export class DashboardComponent implements OnInit, OnDestroy {
  heroes?: Atom<Hero[]>;
  loading?: Atom<boolean>;

  readonly placeholders = [1, 2, 3, 4];
  readonly hue = heroHue;
  readonly initials = heroInitials;

  private readonly changeDetector = inject(ChangeDetectorRef);

  async ngOnInit() {
    await store.loadModule(dashboardModule);
    this.heroes = dashboardModule.data$.selectTopHeroes;
    this.loading = dashboardModule.data$.selectLoading;
    this.changeDetector.markForCheck();

    void dashboardModule.actions.loadHeroes();
  }

  ngOnDestroy(): void {
    void store.unloadModule(dashboardModule, true);
  }
}
