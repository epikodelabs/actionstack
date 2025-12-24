# Interface: Middleware()

Defined in: [types.ts:215](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L215)

Interface defining the structure of a middleware function.

Middleware functions are used to intercept, handle, and potentially modify the dispatching process in ActionStack-like stores.
This interface defines the expected behavior for a middleware function.

> **Middleware**(`api`): (`next`) => (`action`) => `any`

Defined in: [types.ts:216](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L216)

Interface defining the structure of a middleware function.

Middleware functions are used to intercept, handle, and potentially modify the dispatching process in ActionStack-like stores.
This interface defines the expected behavior for a middleware function.

## Parameters

### api

[`MiddlewareAPI`](../type-aliases/MiddlewareAPI.md)

## Returns

> (`next`): (`action`) => `any`

### Parameters

#### next

`Function`

### Returns

> (`action`): `any`

#### Parameters

##### action

[`AsyncAction`](AsyncAction.md)\<`any`, `any`\> | [`Action`](Action.md)\<`any`\>

#### Returns

`any`

## Properties

### signature?

> `optional` **signature**: `string`

Defined in: [types.ts:217](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L217)
