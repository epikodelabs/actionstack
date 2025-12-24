# Function: bindActionCreators()

> **bindActionCreators**(`actionCreators`, `dispatch`): `any`

Defined in: [actions.ts:290](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/actions.ts#L290)

Binds multiple action creators to the dispatch function.

## Parameters

### actionCreators

An object of action creators or a single action creator function.

`Function` | `Record`\<`string`, `Function`\>

### dispatch

`Function`

The dispatch function.

## Returns

`any`

An object of bound action creators or a single bound action creator function.
