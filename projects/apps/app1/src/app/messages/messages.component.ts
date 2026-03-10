import { Component } from '@angular/core';
import { registerModule } from '@epikodelabs/actionstack';
import type { Stream } from '@epikodelabs/streamix';
import { store } from '../app.module';
import { messagesModule } from './messages.slice';

@Component({
  selector: 'app-messages',
  templateUrl: './messages.component.html',
  styleUrls: ['./messages.component.css'],
  standalone: false
})
export class MessagesComponent {
  messages$!: Stream<any>;

  constructor() {
    registerModule(store, messagesModule);
  }

  async ngOnInit() {
    this.messages$ = messagesModule.data$.selectMessages();
  }

  addMessage(message: string) {
    messagesModule.actions.addMessage(message);
  }

  clearMessages() {
    messagesModule.actions.clearMessages();
  }
}

