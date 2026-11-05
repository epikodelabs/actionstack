import { Location } from '@angular/common';
import type { OnDestroy, OnInit } from '@angular/core';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import type { Atom } from '@epikodelabs/streamix';
import { store } from '../app.module';
import type { Hero } from '../hero';
import { heroHue, heroInitials } from '../hero-presentation';
import { heroDetailsModule, loadHero } from './hero-details.slice';

@Component({
  selector: 'app-hero-details',
  templateUrl: './hero-details.component.html',
  styleUrls: ['./hero-details.component.css'],
  standalone: false
})
export class HeroDetailsComponent implements OnInit, OnDestroy {
  hero?: Atom<Hero | undefined>;
  /** Unsaved edit; `undefined` shows the committed name. */
  draftName?: string;

  readonly hue = heroHue;
  readonly initials = heroInitials;

  private heroId = 0;
  private readonly changeDetector = inject(ChangeDetectorRef);

  constructor(
    private route: ActivatedRoute,
    private location: Location
  ) {}

  async ngOnInit() {
    await store.loadModule(heroDetailsModule);
    this.hero = heroDetailsModule.data$.heroSelector();
    this.changeDetector.markForCheck();

    this.heroId = Number(this.route.snapshot.paramMap.get('id'));
    void store.dispatch(loadHero(this.heroId));
  }

  canSave(name: string, savedName: string): boolean {
    const next = name?.trim() ?? '';
    return next.length > 0 && next !== savedName;
  }

  async save(name: string): Promise<void> {
    const next = name?.trim();
    if (!next) {
      return;
    }

    await heroDetailsModule.actions.renameHero(this.heroId, next);
    this.draftName = undefined;
  }

  goBack(): void {
    this.location.back();
  }

  ngOnDestroy() {
    void store.unloadModule(heroDetailsModule, true);
  }
}
