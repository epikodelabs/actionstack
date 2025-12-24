# Function: createActionHandler()

> **createActionHandler**(`config`, `options`): (`action`, `next`, `lockOrNested`, `maybeNestedDispatch`) => `Promise`\<`void`\>

Defined in: [starter.ts:26](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/starter.ts#L26)

Functional handler for managing actions within middleware.

## Parameters

### config

[`MiddlewareConfig`](../interfaces/MiddlewareConfig.md)

Configuration object for the middleware.

### options

#### lockThunks?

`boolean`

## Returns

- A function to handle actions.

> (`action`, `next`, `lockOrNested`, `maybeNestedDispatch`): `Promise`\<`void`\>

Handles the given action, processing it either synchronously or asynchronously.

### Parameters

#### action

The action to be processed.

[`AsyncAction`](../interfaces/AsyncAction.md)\<`any`, `any`\> | [`Action`](../interfaces/Action.md)\<`any`\>

#### next

`Function`

The next middleware function in the chain.

#### lockOrNested

`any` = `false`

Boolean flag or legacy lock arg used to infer nested dispatch.

#### maybeNestedDispatch

`boolean` = `false`

Indicates whether the action is dispatched from within another action.

### Returns

`Promise`\<`void`\>

- A promise if the action is asynchronous, otherwise void.
