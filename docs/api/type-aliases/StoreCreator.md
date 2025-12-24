# Type Alias: StoreCreator()\<T\>

> **StoreCreator**\<`T`\> = (`settings?`, `enhancer?`) => [`Store`](Store.md)\<`T`\>

Defined in: [types.ts:374](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L374)

Type definition for a function that creates a store instance.

## Type Parameters

### T

`T` = `any`

The type of the state managed by the store.

## Parameters

### settings?

[`StoreSettings`](StoreSettings.md)

Optional settings for the store, such as dispatch behavior or feature toggles.

### enhancer?

[`StoreEnhancer`](StoreEnhancer.md)

Optional enhancer function to extend or modify the store's functionality.

## Returns

[`Store`](Store.md)\<`T`\>

The created store instance with methods for managing state and actions.
