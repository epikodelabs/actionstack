# Type Alias: ThunkAction\<TState, TDependencies\>

> **ThunkAction**\<`TState`, `TDependencies`\> = [`AsyncAction`](../interfaces/AsyncAction.md)\<`TState`, `TDependencies`\> & `object`

Defined in: [types.ts:104](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L104)

An async thunk action (function) with attached metadata used by the starter middleware.

## Type Declaration

### type

> **type**: `string`

### toString()

> **toString**: () => `string`

#### Returns

`string`

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

### TState

`TState` = `any`

### TDependencies

`TDependencies` = `any`
