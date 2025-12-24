# Type Alias: ActionHandler()\<State, Payload\>

> **ActionHandler**\<`State`, `Payload`\> = (`state`, `payload`) => `State` \| `Promise`\<`State`\>

Defined in: [types.ts:157](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L157)

## Type Parameters

### State

`State` = `any`

### Payload

`Payload` = `any`

## Parameters

### state

`State`

The current state of the slice.

### payload

`Payload`

The payload of the action that triggered this handler. Optional, as not all actions have payloads.

## Returns

`State` \| `Promise`\<`State`\>

The new state of the slice, or a Promise resolving to the new state.
