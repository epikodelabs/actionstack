# Function: isBoxed()

> **isBoxed**(`value`): `boolean`

Defined in: [types.ts:565](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L565)

Checks if a value is a boxed primitive.

This function checks if a value is not `undefined` or `null`, and its value doesn't strictly equal itself when called with `valueOf()`.
Primitive values wrapped in their corresponding object representations (e.g., new Number(10)) are considered boxed.

## Parameters

### value

`any`

The value to check if it's boxed.

## Returns

`boolean`

boolean - True if the value is a boxed primitive, false otherwise.
