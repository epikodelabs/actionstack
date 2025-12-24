# Interface: Action\<T\>

Defined in: [types.ts:21](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L21)

Describes a standard action object used to signal state changes.

Actions are dispatched to update the state in ActionStack-like stores.

## Type Parameters

### T

`T` = `any`

Type of the action payload. Defaults to `any`.

## Properties

### type

> **type**: `string`

Defined in: [types.ts:22](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L22)

***

### payload?

> `optional` **payload**: `T`

Defined in: [types.ts:23](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L23)

***

### error?

> `optional` **error**: `boolean`

Defined in: [types.ts:24](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L24)

***

### meta?

> `optional` **meta**: `any`

Defined in: [types.ts:25](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L25)

***

### source?

> `optional` **source**: `any`

Defined in: [types.ts:26](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L26)
