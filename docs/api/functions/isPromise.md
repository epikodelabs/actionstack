# Function: isPromise()

> **isPromise**(`value`): `boolean`

Defined in: [types.ts:578](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L578)

Checks if a value is a Promise object.

This function uses a trick to identify promises. It resolves the value with `Promise.resolve` and compares the resolved value with the original value.
If they are the same, it's likely a promise.

## Parameters

### value

`any`

The value to check if it's a Promise.

## Returns

`boolean`

boolean - True if the value is a Promise, false otherwise.
