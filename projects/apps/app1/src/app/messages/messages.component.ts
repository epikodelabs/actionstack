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
  readonly messages: Atom<string[]> = messagesModule.data$.selectMessages;

  clearMessages(): void {
    void messagesModule.actions.clearMessages();
  }
}
