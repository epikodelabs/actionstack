import { importProvidersFrom } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';

import { AppRoutingModule } from './app/app-routing.module';
import { store } from './app/app.module';
import { AppComponent } from './app/app.component';
import { messagesModule } from './app/messages/messages.slice';

async function bootstrap() {
  await store.loadModule(messagesModule);

  await bootstrapApplication(AppComponent, {
    providers: [importProvidersFrom(AppRoutingModule)]
  });
}

bootstrap().catch(err => console.error(err));

