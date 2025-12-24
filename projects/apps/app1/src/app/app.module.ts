import { combineEnhancers, createStore } from '@epikodelabs/actionstack';
import { logger } from '@epikodelabs/actionstack/tools';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';

import { applyMiddleware } from '@epikodelabs/actionstack';
import { withTracker } from '@epikodelabs/actionstack/tracking';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MessagesModule } from './messages/messages.module';


export const store = createStore({ awaitStatePropagation: true }, combineEnhancers(withTracker(), applyMiddleware(logger)));


@NgModule({
  imports: [
    BrowserModule,
    FormsModule,
    AppRoutingModule,
    MessagesModule
  ],
  declarations: [
    AppComponent
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}


