# Function: getRegisteredThunks()

> **getRegisteredThunks**(): [`ThunkCreator`](../type-aliases/ThunkCreator.md)\<`any`, `any`, `any`, `any`[]\>[]

Defined in: [actions.ts:34](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/actions.ts#L34)

Returns an array of all registered thunk creators.

Thunks are asynchronous action creators that can be automatically
invoked by the middleware when their corresponding actions are dispatched.

## Returns

[`ThunkCreator`](../type-aliases/ThunkCreator.md)\<`any`, `any`, `any`, `any`[]\>[]

Array of registered thunk creators.
