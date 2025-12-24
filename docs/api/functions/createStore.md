# Function: createStore()

> **createStore**\<`T`\>(`storeSettingsOrEnhancer?`, `enhancer?`): [`Store`](../type-aliases/Store.md)\<`T`\>

Defined in: [store.ts:153](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/store.ts#L153)

Creates a new store instance.

This function initializes a store with the provided `mainModule` configuration and optional store enhancer.
It also accepts store settings that define various configuration options for the store.
The `storeSettings` parameter defaults to `defaultStoreSettings` if not provided.

## Type Parameters

### T

`T` = `any`

## Parameters

### storeSettingsOrEnhancer?

[`StoreSettings`](../type-aliases/StoreSettings.md) | [`StoreEnhancer`](../type-aliases/StoreEnhancer.md)

### enhancer?

[`StoreEnhancer`](../type-aliases/StoreEnhancer.md)

## Returns

[`Store`](../type-aliases/Store.md)\<`T`\>
