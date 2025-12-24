# Function: applyChange()

> **applyChange**(`initialState`, `path`, `value`, `objTree`): `any`

Defined in: [utils.ts:339](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/utils.ts#L339)

Updates a nested state object by applying a change to the specified path and value.
Ensures that intermediate nodes in the state are properly cloned or created, preserving immutability
for unchanged branches. Tracks visited nodes in the provided object tree to avoid redundant updates.

## Parameters

### initialState

`any`

### path

`string`[]

### value

`any`

### objTree

[`Tree`](../type-aliases/Tree.md)\<`boolean`\>

## Returns

`any`
