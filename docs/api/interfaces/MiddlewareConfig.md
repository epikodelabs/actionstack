# Interface: MiddlewareConfig\<TState, TDependencies\>

Defined in: [starter.ts:13](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/starter.ts#L13)

## Type Parameters

### TState

`TState` = `any`

The overall type of your application's state.

### TDependencies

`TDependencies` *extends* `Record`\<`string`, `any`\> = `Record`\<`string`, `any`\>

The type of the object containing application dependencies.

Configuration object for the middleware pipeline.
This object provides the necessary context and utilities to each middleware function.
It's the `config` parameter received by middleware functions like `exclusive` and `concurrent`.

## Properties

### dispatch()

> **dispatch**: (`action`) => `Promise`\<`void`\>

Defined in: [starter.ts:14](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/starter.ts#L14)

#### Parameters

##### action

[`AsyncAction`](AsyncAction.md)\<`any`, `any`\> | [`Action`](Action.md)\<`any`\>

#### Returns

`Promise`\<`void`\>

***

### getState()

> **getState**: () => `TState`

Defined in: [starter.ts:15](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/starter.ts#L15)

#### Returns

`TState`

***

### dependencies()

> **dependencies**: () => `TDependencies`

Defined in: [starter.ts:16](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/starter.ts#L16)

#### Returns

`TDependencies`

***

### queue

> **queue**: `object`

Defined in: [starter.ts:17](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/starter.ts#L17)

#### enqueue()

> **enqueue**: \<`T`\>(`operation`, `options?`) => `Promise`\<`T`\>

##### Type Parameters

###### T

`T` = `any`

##### Parameters

###### operation

() => `T` \| `Promise`\<`T`\>

###### options?

###### inlineIfRunning?

`boolean`

##### Returns

`Promise`\<`T`\>

#### pending

##### Get Signature

> **get** **pending**(): `number`

###### Returns

`number`

#### isEmpty

##### Get Signature

> **get** **isEmpty**(): `boolean`

###### Returns

`boolean`
