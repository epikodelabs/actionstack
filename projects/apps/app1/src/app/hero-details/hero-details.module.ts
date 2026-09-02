import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Routes } from '@angular/router';
import { RouterModule } from '@angular/router';
import { AtomDirective } from '../atom.directive';

import { HeroDetailsComponent } from './hero-details.component';

const routes: Routes = [
  { path: '', component: HeroDetailsComponent, pathMatch: 'full' },
];

@NgModule({
  imports: [CommonModule, FormsModule, RouterModule.forChild(routes), AtomDirective],
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

