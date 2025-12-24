# Type Alias: Tree\<LeafType, T\>

> **Tree**\<`LeafType`, `T`\> = `{ [K in keyof T]: T[K] extends object ? Tree<LeafType, T[K]> : LeafType }`

Defined in: [types.ts:301](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L301)

Type alias representing a recursive tree structure.

This type is used to define nested objects in a hierarchical way.
- `LeafType`: The type for the leaf nodes of the tree (representing the base values).
- `T`: Optional type parameter for the root object type (defaults to `any`).

The structure works as follows:
 - For each property key `K` in the root object type `T`:
     - If the property value `T[K]` is an object:
         - The type for that property becomes another `Tree` instance, recursively defining the nested structure.
     - If the property value `T[K]` is not an object:
         - The type for that property becomes the `LeafType`.

This type allows for representing complex object structures with nested objects and leaf nodes.

## Type Parameters

### LeafType

`LeafType`

### T

`T` = `any`
