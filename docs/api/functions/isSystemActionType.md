# Function: isSystemActionType()

> **isSystemActionType**(`type`): `boolean`

Defined in: [store.ts:88](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/store.ts#L88)

Checks whether an action type belongs to the internal system namespace.

## Parameters

### type

`string`

Action type string to check.

## Returns

`boolean`

True when the type starts with "system/".
