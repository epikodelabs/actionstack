# Interface: Observer\<T\>

Defined in: [types.ts:225](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L225)

Represents an observer that receives notifications of values from an Stream.

## Type Parameters

### T

`T`

The type of the value being observed.

## Properties

### next()

> **next**: (`value`) => `void`

Defined in: [types.ts:226](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L226)

#### Parameters

##### value

`T`

#### Returns

`void`

***

### error()

> **error**: (`err`) => `void`

Defined in: [types.ts:227](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L227)

#### Parameters

##### err

`any`

#### Returns

`void`

***

### complete()

> **complete**: () => `void`

Defined in: [types.ts:228](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L228)

#### Returns

`void`
