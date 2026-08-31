import type { OnDestroy, OnInit } from '@angular/core';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

import { MessagesModule } from './messages/messages.module';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: true,
  imports: [RouterModule, MessagesModule]
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'Tour of Heroes';
  constructor() {}

  ngOnInit() {
  }

  ngOnDestroy() {}
}
