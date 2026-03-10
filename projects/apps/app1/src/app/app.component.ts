import type { OnDestroy, OnInit } from '@angular/core';
import { Component } from '@angular/core';
import type { Subscription } from 'rxjs/internal/Subscription';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: false
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'Tour of Heroes';
  subscription!: Subscription;
  constructor() {
  }

  ngOnInit() {
  }

  ngOnDestroy() {
  }
}
