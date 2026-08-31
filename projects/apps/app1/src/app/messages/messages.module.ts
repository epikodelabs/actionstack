import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AtomDirective } from '../atomDirective';

import { MessagesComponent } from './messages.component';
import type { store } from '../app.module';

@NgModule({
  imports: [CommonModule, FormsModule, RouterModule, AtomDirective],
  declarations: [
    MessagesComponent,
  ],
  exports: [
    MessagesComponent
  ]
})
export class MessagesModule {
  constructor() {
  }
}

