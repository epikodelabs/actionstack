# Function: isPlainObject()

> **isPlainObject**(`obj`): `boolean`

Defined in: [types.ts:617](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L617)

Checks if a value is a plain object.

This function determines if the provided value is a plain object (an object
that doesn't inherit from other prototypes).

## Parameters

### obj

`any`

The value to check if it's a plain object.

## Returns

`boolean`

boolean - True if the value is an object and its prototype is the same as the Object.prototype, false otherwise.
