# Function: getActionHandlers()

> **getActionHandlers**(`type`): [`ActionHandler`](../type-aliases/ActionHandler.md) \| `undefined`

Defined in: [actions.ts:42](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/actions.ts#L42)

Retrieves the registered handler function for a specific action type.

## Parameters

### type

`string`

The action type to look up.

## Returns

[`ActionHandler`](../type-aliases/ActionHandler.md) \| `undefined`

The handler function associated with the action type, or `undefined` if none is registered.
