# Function: applyMiddleware()

> **applyMiddleware**(...`middlewares`): [`StoreEnhancer`](../type-aliases/StoreEnhancer.md)

Defined in: [utils.ts:365](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/utils.ts#L365)

Applies middleware to the store's dispatch function.
Middleware enhances the dispatch function, allowing actions to be intercepted and modified.

## Parameters

### middlewares

...`Function`[]

Middleware functions to apply.

## Returns

[`StoreEnhancer`](../type-aliases/StoreEnhancer.md)

A store enhancer that applies the middleware to the store.
