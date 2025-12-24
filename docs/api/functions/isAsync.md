# Function: isAsync()

> **isAsync**(`func`): `boolean`

Defined in: [types.ts:604](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L604)

Checks if a function is an async function.

This function uses the constructor name to determine if the provided function
is an async function introduced in ES2018.

## Parameters

### func

`Function`

The function to check if it's an async function.

## Returns

`boolean`

boolean - True if the function's constructor name is "AsyncFunction", false otherwise.
