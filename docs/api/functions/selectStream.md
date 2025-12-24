# Function: selectStream()

> **selectStream**\<`T`, `R`\>(`selector`, `stateStream`): `Stream`\<`R`\>

Defined in: [selectors.ts:234](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/selectors.ts#L234)

Creates a stream from a selector and a state stream.

## Type Parameters

### T

`T`

### R

`R`

## Parameters

### selector

[`Selector`](../type-aliases/Selector.md)\<`T`, `R`\>

A selector function used to derive a value from the state.

### stateStream

`Stream`\<`T`\>

The source stream of state values.

## Returns

`Stream`\<`R`\>
