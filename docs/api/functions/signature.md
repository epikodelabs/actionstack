# Function: signature()

> **signature**(): `string`

Defined in: [hash.ts:33](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/hash.ts#L33)

Generates a signature by combining a random salt and a 3-character hash of the salt, separated by dots.

## Returns

`string`

- A string containing the salt and its hash separated by dots (e.g., "abc.def").
