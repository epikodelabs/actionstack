# Function: deepMerge()

> **deepMerge**(`target`, `source`): `any`

Defined in: [utils.ts:216](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/utils.ts#L216)

Deeply merges two objects, combining nested trees of state.

This function recursively merges properties of the `source` object into
the `target` object. If a key exists in both and both values are plain
objects, their contents are merged. Arrays and non-object values are overwritten.

## Parameters

### target

`any`

The target object to merge into.

### source

`any`

The source object to merge from.

## Returns

`any`

- A new object that is the result of deeply merging `target` and `source`.

## Example

```ts
const a = { foo: { bar: 1 }, baz: 2 };
const b = { foo: { qux: 3 } };
const result = deepMerge(a, b);
// result -> { foo: { bar: 1, qux: 3 }, baz: 2 }
```
