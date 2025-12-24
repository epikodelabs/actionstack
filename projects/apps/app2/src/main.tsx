import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { createStore, populateStore } from '@epikodelabs/actionstack';
import { counter } from './store';

export const store = createStore();
export const counterModule = populateStore(store, counter);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

