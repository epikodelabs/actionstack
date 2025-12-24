# Interface: AsyncObserver\<T\>

Defined in: [types.ts:236](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L236)

Represents an asynchronous observer that receives notifications of values from an Stream.

## Type Parameters

### T

`T`

The type of the value being observed.

## Properties

### next()

> **next**: (`value`) => `Promise`\<`void`\>

Defined in: [types.ts:237](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L237)

#### Parameters

##### value

`T`

#### Returns

`Promise`\<`void`\>

***

### error()

> **error**: (`err`) => `Promise`\<`void`\>

Defined in: [types.ts:238](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L238)

#### Parameters

##### err

`any`

#### Returns

`Promise`\<`void`\>

***

### complete()

> **complete**: () => `Promise`\<`void`\>

Defined in: [types.ts:239](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L239)

#### Returns

`Promise`\<`void`\>
