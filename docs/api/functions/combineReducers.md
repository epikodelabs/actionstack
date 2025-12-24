# Function: combineReducers()

> **combineReducers**(`reducers`): [`AsyncReducer`](../type-aliases/AsyncReducer.md)

Defined in: [utils.ts:239](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/utils.ts#L239)

Combines reducers into a single reducer function.
Initializes the default state by invoking each reducer with `undefined` and a special `@@INIT` action.

## Parameters

### reducers

[`Tree`](../type-aliases/Tree.md)\<[`Reducer`](../type-aliases/Reducer.md) \| [`AsyncReducer`](../type-aliases/AsyncReducer.md)\>

## Returns

[`AsyncReducer`](../type-aliases/AsyncReducer.md)
