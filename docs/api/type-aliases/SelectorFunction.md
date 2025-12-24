# Type Alias: SelectorFunction()\<S, R\>

> **SelectorFunction**\<`S`, `R`\> = (`state`, `props?`) => `Promise`\<`R`\> \| `R`

Defined in: [types.ts:271](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L271)

Interface defining the structure of a selector function.

Selectors are functions that extract specific data or derived values from the ActionStack store's state.

## Type Parameters

### S

`S` = `any`

### R

`R` = `any`

## Parameters

### state

`S`

The current state of the application.

### props?

`any`

Optional props object that can be used by the selector for additional logic.

## Returns

`Promise`\<`R`\> \| `R`

any - The selected value or derived data from the state.
