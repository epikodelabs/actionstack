# Function: isAction()

> **isAction**(`action`): `action is Action<any>`

Defined in: [types.ts:591](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L591)

Checks if a value is a valid ActionStack action object.

This function determines if the provided value is a valid action object
used in ActionStack for dispatching state changes.

## Parameters

### action

`any`

The value to check if it's a ActionStack action.

## Returns

`action is Action<any>`

boolean - True if the value is a plain object with a string property named "type", false otherwise.
