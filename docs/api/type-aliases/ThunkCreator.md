# Type Alias: ThunkCreator\<TType, TState, TDependencies, TArgs\>

> **ThunkCreator**\<`TType`, `TState`, `TDependencies`, `TArgs`\> = (...`args`) => [`ThunkAction`](ThunkAction.md)\<`TState`, `TDependencies`\> & `object`

Defined in: [types.ts:129](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L129)

A factory for creating asynchronous actions (thunks) with built-in metadata.

## Type Declaration

### type

> **type**: `TType`

### toString()

> **toString**: () => `TType`

#### Returns

`TType`

### match()

> **match**: (`action`) => `action is Action<any>`

#### Parameters

##### action

`unknown`

#### Returns

`action is Action<any>`

### isThunk

> **isThunk**: `true`

### triggers?

> `optional` **triggers**: `ReadonlyArray`\<[`ThunkTrigger`](ThunkTrigger.md)\>

## Type Parameters

### TType

`TType` *extends* `string` = `string`

### TState

`TState` = `any`

### TDependencies

`TDependencies` = `any`

### TArgs

`TArgs` *extends* readonly `any`[] = `any`[]

## Template

The string type identifier for the thunk.

## Template

The thunk function type (typically [AsyncAction](../interfaces/AsyncAction.md)).

## Template

Argument types accepted by the thunk creator function.

## Returns

A callable that produces an [AsyncAction](../interfaces/AsyncAction.md) when invoked with `Args`.
