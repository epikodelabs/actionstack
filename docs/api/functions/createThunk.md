# Function: createThunk()

> **createThunk**\<`TType`, `TArgs`\>(`type`, `thunkBodyCreator`, `triggers?`): [`ThunkCreator`](../type-aliases/ThunkCreator.md)\<`TType`, `any`, `any`, `TArgs`\>

Defined in: [actions.ts:215](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/actions.ts#L215)

Creates an asynchronous thunk action creator function.

A thunk is a function that can perform asynchronous logic and dispatch
multiple actions before and/or after its asynchronous operations complete.

This version also supports "triggers" — action types or matcher functions
that, when matched by any dispatched action, will cause this thunk to be
executed automatically.

## Type Parameters

### TType

`TType` *extends* `string`

### TArgs

`TArgs` *extends* readonly `any`[] = \[\]

## Parameters

### type

`TType`

The action type string for the thunk (used for matching and debugging).

### thunkBodyCreator

(...`args`) => [`AsyncAction`](../interfaces/AsyncAction.md)\<`any`, `any`\>

A factory function that receives the thunk's arguments
  and returns the actual thunk body function to execute.

### triggers?

readonly [`ThunkTrigger`](../type-aliases/ThunkTrigger.md)[]

Optional list of trigger definitions. Each trigger can be:
  - a string action type to match exactly, or
  - a matcher function that receives the dispatched action and returns `true` if the thunk should run.

## Returns

[`ThunkCreator`](../type-aliases/ThunkCreator.md)\<`TType`, `any`, `any`, `TArgs`\>

A thunk creator function. Calling this function with arguments will
  return a thunk function with attached metadata:
  - `type`: the action type string
  - `match(action)`: checks if the given action matches this thunk's type
  - `isThunk`: `true` for identification in middleware
  - `triggers`: (optional) the list of trigger definitions
