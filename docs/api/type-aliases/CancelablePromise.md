# Type Alias: CancelablePromise\<T\>

> **CancelablePromise**\<`T`\> = `Promise`\<`T`\> & `object`

Defined in: [types.ts:10](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L10)

A cancelable promise.

Note: Implementations should be Promise-compatible (including `[Symbol.toStringTag]`)
so they are assignable to `Promise<T>`.

## Type Declaration

### cancel()

> **cancel**(): `void`

#### Returns

`void`

## Type Parameters

### T

`T` = `any`
