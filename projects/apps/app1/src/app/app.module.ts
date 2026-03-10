import { combineEnhancers, createStore } from '@epikodelabs/actionstack';
import { logger } from '@epikodelabs/actionstack/tools';

import { applyMiddleware } from '@epikodelabs/actionstack';
import { withTracker } from '@epikodelabs/actionstack/tracking';

export const store = createStore({ awaitStatePropagation: true }, combineEnhancers(withTracker(), applyMiddleware(logger)));


