# Function: createModule()

> **createModule**\<`State`, `ActionTypes`, `Actions`, `Selectors`, `Dependencies`\>(`config`): [`FeatureModule`](../interfaces/FeatureModule.md)\<`State`, `ActionTypes`, `Actions`, `Selectors`, `Dependencies`\>

Defined in: [module.ts:32](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/module.ts#L32)

Creates a feature module that encapsulates a slice of state, its actions, selectors,
dependencies, and reactive data streams.

Feature modules can be configured with a store instance via `.configure(store)` and
expose strongly-typed actions and selectors. Data streams (`data$`) are deferred until
the module is loaded, and stop emitting when the module is destroyed.

## Type Parameters

### State

`State`

The type of the module's state slice.

### ActionTypes

`ActionTypes` *extends* `string`

The union type of action string constants for this module.

### Actions

`Actions` *extends* `Record`\<`string`, [`ActionCreator`](../type-aliases/ActionCreator.md)\<`ActionTypes`\> \| (...`args`) => `any`\>

The shape of the module's action creators and/or thunks.

### Selectors

`Selectors` *extends* `Record`\<`string`, (`state`) => `any`\>

The shape of the module's selector factories.

### Dependencies

`Dependencies` *extends* `Record`\<`string`, `any`\> = \{ \}

The shape of any dependencies injected into the module.

## Parameters

### config

Module configuration.

#### slice

`string`

The unique path identifying this module in the store state.

#### initialState

`State`

The initial state of the module slice.

#### actions?

`Actions`

Optional set of action creators or thunks.

#### selectors?

`Selectors`

Optional set of selector factories for derived data.

#### dependencies?

`Dependencies`

Optional dependency objects to inject into thunks.

## Returns

[`FeatureModule`](../interfaces/FeatureModule.md)\<`State`, `ActionTypes`, `Actions`, `Selectors`, `Dependencies`\>

A fully configured module instance.
