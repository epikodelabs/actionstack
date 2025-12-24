# Interface: AsyncAction()\<TState, TDependencies\>

Defined in: [types.ts:60](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L60)

Represents an asynchronous action (thunk) that can dispatch other actions and access state.

Used for side effects and complex state flows. Receives utilities for dispatching, reading state,
and accessing app-level dependencies.

## Type Parameters

### TState

`TState` = `any`

The shape of the application or relevant state.

### TDependencies

`TDependencies` = `any`

The structure of the dependencies object.

> **AsyncAction**(`dispatch`, `getState`, `dependencies`): `Promise`\<`void`\>

Defined in: [types.ts:64](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L64)

## Parameters

### dispatch

[`Dispatch`](../type-aliases/Dispatch.md)\<`TState`, `TDependencies`\>

Function to dispatch synchronous or asynchronous actions.

### getState

[`GetState`](../type-aliases/GetState.md)\<`TState`\>

Function to retrieve the current state.

### dependencies

`TDependencies`

Application dependencies injected into async logic.

## Returns

`Promise`\<`void`\>

A Promise that resolves when the async operation finishes.
