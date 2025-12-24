# Type Alias: StoreEnhancer()

> **StoreEnhancer** = (`next`) => [`StoreCreator`](StoreCreator.md)

Defined in: [types.ts:387](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L387)

Type alias for a store enhancer function.

This type represents a function that takes the next store creation function as an argument,
and returns a new store creation function potentially with additional functionality.
Store enhancers are used to extend the capabilities of the store creation process.

## Parameters

### next

[`StoreCreator`](StoreCreator.md)

The next store creation function in the chain (typically the default store creator).

## Returns

[`StoreCreator`](StoreCreator.md)

StoreCreator - A new store creation function that potentially wraps the original one
                        and provides additional functionality.
