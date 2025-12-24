# Type Alias: ProjectionFunction()\<R, P\>

> **ProjectionFunction**\<`R`, `P`\> = (`results`, `props?`) => `R`

Defined in: [types.ts:283](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L283)

Interface defining the structure of a projection function.

Projection functions are similar to selector functions, but they can handle projecting data from
either a single state object or an array of state objects.

## Type Parameters

### R

`R` = `any`

### P

`P` = `any`

## Parameters

### results

`any`[]

The current state(s) of the application (can be a single object or an array of state objects).

### props?

`P`

Optional props object that can be used by the projection function for additional logic.

## Returns

`R`

any - The projected value or derived data from the state.
