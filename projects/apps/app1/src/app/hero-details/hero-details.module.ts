import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import type { Routes } from '@angular/router';

import type { HeroService } from '../hero.service';
import { HeroDetailsComponent } from './hero-details.component';
import type { heroDetailsModule, initialState, slice } from './hero-details.slice';
import type { store } from '../app.module';

const routes: Routes = [
  { path: '', component: HeroDetailsComponent, pathMatch: 'full' },
];

@NgModule({
  imports: [CommonModule, FormsModule, RouterModule.forChild(routes)],
  declarations: [
    HeroDetailsComponent,
  ],
  exports: [
    HeroDetailsComponent
  ]
})
export class HeroDetailsModule {
  constructor() {
  }
}

