# Function: unregisterModule()

> **unregisterModule**\<`State`, `ActionTypes`, `Actions`, `Selectors`, `Dependencies`\>(`store`, ...`modulesOrClearState`): [`FeatureModule`](../interfaces/FeatureModule.md)\<`State`, `ActionTypes`, `Actions`, `Selectors`, `Dependencies`\>[]

Defined in: [module.ts:380](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/module.ts#L380)

Unregisters one or more modules from the store.

- Calls `store.unloadModule()` for each module.
- Optionally clears the module's state from the store.

## Type Parameters

### State

`State`

Module state type.

### ActionTypes

`ActionTypes` *extends* `string`

Action string union.

### Actions

`Actions` *extends* `Record`\<`string`, `any`\>

Shape of module actions.

### Selectors

`Selectors` *extends* `Record`\<`string`, `any`\>

Shape of module selectors.

### Dependencies

`Dependencies` *extends* `Record`\<`string`, `any`\>

Shape of module dependencies.

## Parameters

### store

[`Store`](../type-aliases/Store.md)\<`any`\>

The store instance.

### modulesOrClearState

...(`boolean` \| [`FeatureModule`](../interfaces/FeatureModule.md)\<`State`, `ActionTypes`, `Actions`, `Selectors`, `Dependencies`\>)[]

Modules to unregister, with an optional `clearState` boolean as the first or last argument.

## Returns

[`FeatureModule`](../interfaces/FeatureModule.md)\<`State`, `ActionTypes`, `Actions`, `Selectors`, `Dependencies`\>[]

The modules that were passed in (excluding the clearState flag).
