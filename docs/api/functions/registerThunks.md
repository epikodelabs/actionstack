# Function: registerThunks()

> **registerThunks**(`module`): `void`

Defined in: [actions.ts:92](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/actions.ts#L92)

Registers all thunks defined in a feature module into the global thunk registry.

This allows the store's middleware to automatically invoke thunks
when their `triggers` match a dispatched action.

If a thunk is already registered under the same type, a warning is logged and the
existing thunk is overwritten.

## Parameters

### module

[`FeatureModule`](../interfaces/FeatureModule.md)

The feature module containing thunks to be registered.

## Returns

`void`
