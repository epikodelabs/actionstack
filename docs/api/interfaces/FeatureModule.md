# Interface: FeatureModule\<State, ActionTypes, Actions, Selectors, Dependencies\>

Defined in: [types.ts:344](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L344)

Represents a feature module that organizes state, logic, and dependencies
for a specific part of an application.

## Type Parameters

### State

`State` = `any`

The type of the feature state slice.

### ActionTypes

`ActionTypes` *extends* `string` = `string`

The union type of action type strings.

### Actions

`Actions` *extends* `Record`\<`string`, (...`args`) => [`Action`](Action.md)\<`any`\>\> = `any`

The shape of action creator functions.

### Selectors

`Selectors` *extends* `Record`\<`string`, (`state`) => `any`\> = `any`

The shape of selector functions.

### Dependencies

`Dependencies` = `any`

The type representing dependencies required by the feature.

## Indexable

\[`key`: `string`\]: `any`

## Properties

### slice

> `readonly` **slice**: `string`

Defined in: [types.ts:352](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L352)

A unique identifier string for the feature's state slice in the store.

***

### initialState

> `readonly` **initialState**: `State`

Defined in: [types.ts:353](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L353)

The initial state value for this feature slice.

***

### dependencies?

> `readonly` `optional` **dependencies**: `Dependencies`

Defined in: [types.ts:354](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L354)

***

### loaded$

> `readonly` **loaded$**: `Subject`\<`void`\>

Defined in: [types.ts:355](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L355)

***

### destroyed$

> `readonly` **destroyed$**: `Subject`\<`void`\>

Defined in: [types.ts:356](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L356)

***

### data$

> `readonly` **data$**: [`Streams`](../type-aliases/Streams.md)\<`Selectors`\>

Defined in: [types.ts:357](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L357)

***

### actions

> `readonly` **actions**: `Actions`

Defined in: [types.ts:358](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L358)

An object containing action creator functions.

***

### selectors

> `readonly` **selectors**: `Selectors`

Defined in: [types.ts:359](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L359)

An object containing selector functions to derive data from the state.

***

### init()

> **init**: (`store`) => `FeatureModule`\<`State`, `ActionTypes`, `Actions`, `Selectors`, `Dependencies`\>

Defined in: [types.ts:361](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L361)

#### Parameters

##### store

[`Store`](../type-aliases/Store.md)\<`any`\>

#### Returns

`FeatureModule`\<`State`, `ActionTypes`, `Actions`, `Selectors`, `Dependencies`\>

***

### configure()

> **configure**: (`store`) => `FeatureModule`\<`State`, `ActionTypes`, `Actions`, `Selectors`, `Dependencies`\>

Defined in: [types.ts:362](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L362)

#### Parameters

##### store

[`Store`](../type-aliases/Store.md)\<`State`\>

#### Returns

`FeatureModule`\<`State`, `ActionTypes`, `Actions`, `Selectors`, `Dependencies`\>

***

### destroy()

> **destroy**: (`clearState?`) => `FeatureModule`\<`State`, `ActionTypes`, `Actions`, `Selectors`, `Dependencies`\>

Defined in: [types.ts:363](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L363)

#### Parameters

##### clearState?

`boolean`

#### Returns

`FeatureModule`\<`State`, `ActionTypes`, `Actions`, `Selectors`, `Dependencies`\>
