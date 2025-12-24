# Type Alias: ActionCreator\<TPayload, TType, TArgs\>

> **ActionCreator**\<`TPayload`, `TType`, `TArgs`\> = (...`args`) => [`Action`](../interfaces/Action.md)\<`TPayload`\> & `object`

Defined in: [types.ts:80](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L80)

Creates a synchronous action with optional metadata and helpers for identification.

## Type Declaration

### handler

> **handler**: [`ActionHandler`](ActionHandler.md)\<`any`, `TPayload`\>

### toString()

> **toString**(): `string`

#### Returns

`string`

### type

> **type**: `TType`

### match()

> **match**(`action`): `action is Action<TPayload>`

#### Parameters

##### action

`unknown`

#### Returns

`action is Action<TPayload>`

## Type Parameters

### TPayload

`TPayload` = `any`

Type of the payload for the created action.

### TType

`TType` *extends* `string` = `string`

String literal type of the action.

### TArgs

`TArgs` *extends* readonly `any`[] = `any`[]

Argument types accepted by the action creator function.

## Returns

A function that produces an [Action](../interfaces/Action.md) when invoked, with metadata for matching and debugging.
