# Type Alias: AsyncReducer()\<T\>

> **AsyncReducer**\<`T`\> = (`state`, `action`) => `Promise`\<`T`\>

Defined in: [types.ts:176](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L176)

Type alias for an asynchronous reducer function.

An asynchronous reducer takes the current state and an action object and returns a Promise
that resolves to the updated state.

## Type Parameters

### T

`T` = `any`

## Parameters

### state

`T`

The current state of the application.

### action

[`Action`](../interfaces/Action.md)

The action object being dispatched.

## Returns

`Promise`\<`T`\>

A Promise resolving to the updated state.
