import { Location } from '@angular/common';
import type { OnDestroy, OnInit } from '@angular/core';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import type { Subscription } from '@epikodelabs/streamix';
import { store } from '../app.module';
import { heroHue, heroInitials } from '../hero-presentation';
import { heroDetailsModule, loadHero } from './hero-details.slice';
import type { HeroDetailsState } from './hero-details.slice';

@Component({
  selector: 'app-hero-details',
  templateUrl: './hero-details.component.html',
  styleUrls: ['./hero-details.component.css'],
  standalone: false
})
export class HeroDetailsComponent implements OnInit, OnDestroy {
  // Kept as plain component state: one subscription updates content within the
  // persistent profile card instead of recreating its structural host.
  profile?: HeroDetailsState;
  /** Unsaved edit; `undefined` shows the committed name. */
  draftName?: string;

  readonly hue = heroHue;
  readonly initials = heroInitials;

  private heroId = 0;
  private alive = true;
  private unsubscribeProfile?: Subscription;
  private readonly changeDetector = inject(ChangeDetectorRef);

  constructor(
    private route: ActivatedRoute,
    private location: Location
  ) {}

  async ngOnInit(): Promise<void> {
    await store.loadModule(heroDetailsModule);
    if (!this.alive) return;

    // One native selector, one subscription, one view-model update per state
    // emission. The outer <section class="profile"> never gets replaced.
    this.unsubscribeProfile = heroDetailsModule.data$.profileSelector.subscribe(profile => {
      if (!this.alive) return;
      this.profile = profile;
      this.changeDetector.markForCheck();
    });

    this.heroId = Number(this.route.snapshot.paramMap.get('id'));
    this.load();
  }

  load(): void {
    this.draftName = undefined;
    void store.dispatch(loadHero(this.heroId));
  }

  canSave(name: string, savedName: string): boolean {
    const next = name?.trim() ?? '';
    return next.length > 0 && next !== savedName;
  }

  async save(name: string): Promise<void> {
    const next = name?.trim();
    if (!this.profile?.hero || !next || this.profile.loading) return;

    await heroDetailsModule.actions.renameHero(this.heroId, next);
    this.draftName = undefined;
    this.changeDetector.markForCheck();
  }

  goBack(): void {
    this.location.back();
  }

  ngOnDestroy(): void {
    this.alive = false;
    void this.unsubscribeProfile?.();
    void store.unloadModule(heroDetailsModule, true);
  }
}
