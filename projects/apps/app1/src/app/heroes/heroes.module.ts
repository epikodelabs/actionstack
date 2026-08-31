import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import type { Routes } from '@angular/router';
import { AtomDirective } from '../atomDirective';
import { HeroesComponent } from './heroes.component';

const routes: Routes = [
  { path: '', component: HeroesComponent, pathMatch: 'full' },
];

@NgModule({
  imports: [CommonModule, FormsModule, RouterModule.forChild(routes), AtomDirective],
  declarations: [
    HeroesComponent,
  ],
  exports: [
    HeroesComponent
  ]
})
export class HeroesModule {
  constructor() {
  }
}

