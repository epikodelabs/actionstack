# Type Alias: Dispatch()\<TState, TDependencies\>

> **Dispatch**\<`TState`, `TDependencies`\> = (`action`) => `Promise`\<`void`\>

Defined in: [types.ts:35](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L35)

Dispatch function signature for synchronous actions and thunks.

## Type Parameters

### TState

`TState` = `any`

The store state shape.

### TDependencies

`TDependencies` = `any`

Dependencies available to async actions.

## Parameters

### action

[`Action`](../interfaces/Action.md) | [`AsyncAction`](../interfaces/AsyncAction.md)\<`TState`, `TDependencies`\>

## Returns

`Promise`\<`void`\>
