# Function: bindActionCreator()

> **bindActionCreator**(`actionCreator`, `dispatch`): `Function`

Defined in: [actions.ts:277](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/actions.ts#L277)

Binds a single action creator to the dispatch function.

## Parameters

### actionCreator

`Function`

The action creator function.

### dispatch

`Function`

The dispatch function.

## Returns

`Function`

A function that dispatches the action created by the action creator.
