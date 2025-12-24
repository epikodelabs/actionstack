# Function: combineEnhancers()

> **combineEnhancers**(...`enhancers`): [`StoreEnhancer`](../type-aliases/StoreEnhancer.md)

Defined in: [utils.ts:183](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/utils.ts#L183)

Combines multiple store enhancers into a single enhancer function.
This allows multiple enhancers to be applied in sequence to the store.
Typically used for combining middleware, logging, or other store customizations.

## Parameters

### enhancers

...(`false` \| [`StoreEnhancer`](../type-aliases/StoreEnhancer.md) \| `null` \| `undefined`)[]

An array of store enhancers to be combined.

## Returns

[`StoreEnhancer`](../type-aliases/StoreEnhancer.md)

A single store enhancer that applies all provided enhancers.
