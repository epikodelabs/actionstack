import { combineEnhancers, createStore } from '@epikodelabs/actionstack';
import { logger } from '@epikodelabs/actionstack/tools';

import { applyMiddleware } from '@epikodelabs/actionstack';

export const store = createStore({ awaitStatePropagation: true }, combineEnhancers(applyMiddleware(logger)));


