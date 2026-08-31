import { Component } from '@angular/core';
import type { Atom } from '@epikodelabs/streamix';
import { messagesModule } from './messages.slice';
@Component({
  selector: 'app-messages',
  templateUrl: './messages.component.html',
  styleUrls: ['./messages.component.css'],
  standalone: false
})
export class MessagesComponent {
  messages: Atom<string[]> = messagesModule.data$.selectMessages();

  constructor() {}

  async ngOnInit() {}

  addMessage(message: string) {
    messagesModule.actions.addMessage(message);
  }

  clearMessages() {
    messagesModule.actions.clearMessages();
  }

  ngOnDestroy() {}
}
