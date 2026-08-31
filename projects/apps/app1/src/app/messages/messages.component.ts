import type { OnDestroy, OnInit } from '@angular/core';
import { ChangeDetectorRef, Component } from '@angular/core';
import { registerModule, unregisterModule } from '@epikodelabs/actionstack';
import type { Subscription } from '@epikodelabs/streamix';
import { store } from '../app.module';
import { messagesModule } from './messages.slice';

@Component({
  selector: 'app-messages',
  templateUrl: './messages.component.html',
  styleUrls: ['./messages.component.css'],
  standalone: false
})
export class MessagesComponent implements OnInit, OnDestroy {
  messages: string[] = [];
  subscription?: Subscription;

  constructor(private cdr: ChangeDetectorRef) {
    registerModule(store, messagesModule);
  }

  ngOnInit() {
    messagesModule.attachView(this.cdr);
    this.subscription = messagesModule.data$.selectMessages().subscribe((messages) => {
      this.messages = messages;
    });
  }

  addMessage(message: string) {
    messagesModule.actions.addMessage(message);
  }

  clearMessages() {
    messagesModule.actions.clearMessages();
  }

  ngOnDestroy() {
    messagesModule.detachView(this.cdr);
    this.subscription?.unsubscribe();
    unregisterModule(store, messagesModule, true);
  }
}

