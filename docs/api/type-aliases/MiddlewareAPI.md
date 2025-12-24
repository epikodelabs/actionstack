# Type Alias: MiddlewareAPI\<TState, TDependencies\>

> **MiddlewareAPI**\<`TState`, `TDependencies`\> = `object`

Defined in: [types.ts:189](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L189)

Defines the methods and properties available to middleware for interacting with the store.
Provides access to state, dispatching actions, dependencies, processing strategy,
synchronization, and execution stack.

## Type Parameters

### TState

`TState` = `any`

### TDependencies

`TDependencies` = `any`

## Properties

### getState()

> **getState**: (`slice?`) => `any`

Defined in: [types.ts:190](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L190)

Retrieves the state or a specific slice of the state.

#### Parameters

##### slice?

`string` | `string`[] | `"*"`

#### Returns

`any`

***

### dispatch

> **dispatch**: [`Dispatch`](Dispatch.md)\<`TState`, `TDependencies`\>

Defined in: [types.ts:191](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L191)

Dispatches an action (synchronous or asynchronous).

***

### dependencies()

> **dependencies**: () => `TDependencies`

Defined in: [types.ts:192](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L192)

Retrieves the current dependencies in the pipeline.

#### Returns

`TDependencies`

***

### strategy()

> **strategy**: () => [`ProcessingStrategy`](ProcessingStrategy.md)

Defined in: [types.ts:193](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L193)

Retrieves the current processing strategy.

#### Returns

[`ProcessingStrategy`](ProcessingStrategy.md)

***

### queue

> **queue**: [`ActionQueue`](ActionQueue.md)

Defined in: [types.ts:194](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L194)

A queue to serialize store operations and middleware dispatches.
