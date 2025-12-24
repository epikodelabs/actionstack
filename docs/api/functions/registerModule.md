# Function: registerModule()

> **registerModule**\<`State`, `ActionTypes`, `Actions`, `Selectors`, `Dependencies`\>(`store`, ...`modules`): [`FeatureModule`](../interfaces/FeatureModule.md)\<`State`, `ActionTypes`, `Actions`, `Selectors`, `Dependencies`\>[]

Defined in: [module.ts:347](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/module.ts#L347)

Registers one or more modules into the store.

- If multiple modules are provided, calls `store.populate()` for batch registration.
- If a single module is provided, calls `store.loadModule()` to initialize it.

## Type Parameters

### State

`State`

Module state type.

### ActionTypes

`ActionTypes` *extends* `string`

Action string union.

### Actions

`Actions` *extends* `Record`\<`string`, [`ActionCreator`](../type-aliases/ActionCreator.md)\<`ActionTypes`\> \| (...`args`) => `any`\>

Shape of module actions.

### Selectors

`Selectors` *extends* `Record`\<`string`, (`state`) => `any`\>

Shape of module selectors.

### Dependencies

`Dependencies` *extends* `Record`\<`string`, `any`\> = \{ \}

Shape of module dependencies.

## Parameters

### store

[`Store`](../type-aliases/Store.md)\<`any`\>

The store instance where modules are registered.

### modules

...[`FeatureModule`](../interfaces/FeatureModule.md)\<`State`, `ActionTypes`, `Actions`, `Selectors`, `Dependencies`\>[]

One or more modules to register.

## Returns

[`FeatureModule`](../interfaces/FeatureModule.md)\<`State`, `ActionTypes`, `Actions`, `Selectors`, `Dependencies`\>[]

The modules that were passed in.
