# Function: populateStore()

> **populateStore**\<`State`, `ActionTypes`, `Actions`, `Selectors`, `Dependencies`\>(`store`, ...`modules`): [`FeatureModule`](../interfaces/FeatureModule.md)\<`State`, `ActionTypes`, `Actions`, `Selectors`, `Dependencies`\>[]

Defined in: [module.ts:409](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/module.ts#L409)

## Type Parameters

### State

`State`

### ActionTypes

`ActionTypes` *extends* `string`

### Actions

`Actions` *extends* `Record`\<`string`, `any`\>

### Selectors

`Selectors` *extends* `Record`\<`string`, `any`\>

### Dependencies

`Dependencies` *extends* `Record`\<`string`, `any`\>

## Parameters

### store

[`Store`](../type-aliases/Store.md)\<`any`\>

### modules

...[`FeatureModule`](../interfaces/FeatureModule.md)\<`State`, `ActionTypes`, `Actions`, `Selectors`, `Dependencies`\>[]

## Returns

[`FeatureModule`](../interfaces/FeatureModule.md)\<`State`, `ActionTypes`, `Actions`, `Selectors`, `Dependencies`\>[]
