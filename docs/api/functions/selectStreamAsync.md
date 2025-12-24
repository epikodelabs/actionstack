# Function: selectStreamAsync()

> **selectStreamAsync**\<`T`, `R`\>(`selector`, `stateStream`): `Stream`\<`R`\>

Defined in: [selectors.ts:247](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/selectors.ts#L247)

Creates a stream from an async selector and a state stream.

## Type Parameters

### T

`T`

### R

`R`

## Parameters

### selector

(`state`) => `Promise`\<`R`\>

An async selector function.

### stateStream

`Stream`\<`T`\>

The source stream of state values.

## Returns

`Stream`\<`R`\>
