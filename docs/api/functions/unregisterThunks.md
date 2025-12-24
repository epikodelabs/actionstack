# Function: unregisterThunks()

> **unregisterThunks**(`module`): `void`

Defined in: [actions.ts:118](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/actions.ts#L118)

Unregisters all thunks associated with a feature module.

This removes the module's thunks from the internal registry,
preventing them from being triggered automatically after
the module is destroyed.

## Parameters

### module

[`FeatureModule`](../interfaces/FeatureModule.md)

The feature module whose thunks should be removed.

## Returns

`void`
