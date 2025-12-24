# Type Alias: Store\<TState, TDependencies\>

> **Store**\<`TState`, `TDependencies`\> = `object`

Defined in: [store.ts:51](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/store.ts#L51)

The `Store` type represents the core store object that manages state, actions, and modules.
It provides methods to interact with the store's state, dispatch actions, load/unload modules, and more.

## Type Parameters

### TState

`TState` = `any`

### TDependencies

`TDependencies` = `any`

## Properties

### dispatch

> **dispatch**: [`Dispatch`](Dispatch.md)\<`TState`, `TDependencies`\>

Defined in: [store.ts:52](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/store.ts#L52)

***

### getState()

> **getState**: \{\<`R`\>(`slice`, `callback`): `Promise`\<`void`\>; \<`R`\>(`slice`, `callback`): `Promise`\<`void`\>; \<`R`\>(`slice`, `callback`): `Promise`\<`void`\>; \}

Defined in: [store.ts:54](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/store.ts#L54)

#### Call Signature

> \<`R`\>(`slice`, `callback`): `Promise`\<`void`\>

##### Type Parameters

###### R

`R` = `any`

##### Parameters

###### slice

`"*"`

###### callback

(`state`) => `void`

##### Returns

`Promise`\<`void`\>

#### Call Signature

> \<`R`\>(`slice`, `callback`): `Promise`\<`void`\>

##### Type Parameters

###### R

`R` = `any`

##### Parameters

###### slice

`string`

###### callback

(`state`) => `void`

##### Returns

`Promise`\<`void`\>

#### Call Signature

> \<`R`\>(`slice`, `callback`): `Promise`\<`void`\>

##### Type Parameters

###### R

`R` = `any`

##### Parameters

###### slice

readonly `string`[]

###### callback

(`state`) => `void`

##### Returns

`Promise`\<`void`\>

***

### select()

> **select**: \{\<`R`\>(`selector`, `defaultValue?`): `Stream`\<`R`\>; \<`R`\>(`selector`, `defaultValue?`): `Stream`\<`R`\>; \}

Defined in: [store.ts:60](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/store.ts#L60)

#### Call Signature

> \<`R`\>(`selector`, `defaultValue?`): `Stream`\<`R`\>

##### Type Parameters

###### R

`R` = `any`

##### Parameters

###### selector

(`state`) => `R`

###### defaultValue?

`R`

##### Returns

`Stream`\<`R`\>

#### Call Signature

> \<`R`\>(`selector`, `defaultValue?`): `Stream`\<`R`\>

##### Type Parameters

###### R

`R` = `any`

##### Parameters

###### selector

(`state`) => `Promise`\<`R`\>

###### defaultValue?

`R`

##### Returns

`Stream`\<`R`\>

***

### populate()

> **populate**: (...`modules`) => `Promise`\<`void`\>

Defined in: [store.ts:65](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/store.ts#L65)

#### Parameters

##### modules

...[`FeatureModule`](../interfaces/FeatureModule.md)[]

#### Returns

`Promise`\<`void`\>

***

### loadModule()

> **loadModule**: (`module`) => `Promise`\<`void`\>

Defined in: [store.ts:66](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/store.ts#L66)

#### Parameters

##### module

[`FeatureModule`](../interfaces/FeatureModule.md)

#### Returns

`Promise`\<`void`\>

***

### unloadModule()

> **unloadModule**: (`module`, `clearState?`) => `Promise`\<`void`\>

Defined in: [store.ts:67](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/store.ts#L67)

#### Parameters

##### module

[`FeatureModule`](../interfaces/FeatureModule.md)

##### clearState?

`boolean`

#### Returns

`Promise`\<`void`\>

***

### addReducer()

> **addReducer**: (`reducer`) => `void`

Defined in: [store.ts:69](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/store.ts#L69)

#### Parameters

##### reducer

(`state`, `action`) => `TState` \| `Promise`\<`TState`\>

#### Returns

`void`

***

### middlewareAPI

> **middlewareAPI**: [`MiddlewareAPI`](MiddlewareAPI.md)

Defined in: [store.ts:71](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/store.ts#L71)

***

### starter

> **starter**: [`Middleware`](../interfaces/Middleware.md)

Defined in: [store.ts:72](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/store.ts#L72)

***

### tracker?

> `optional` **tracker**: [`Tracker`](Tracker.md)

Defined in: [store.ts:73](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/store.ts#L73)
