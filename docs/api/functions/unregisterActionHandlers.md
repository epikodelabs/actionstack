# Function: unregisterActionHandlers()

> **unregisterActionHandlers**(`module`): `void`

Defined in: [actions.ts:73](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/actions.ts#L73)

Unregisters all action handlers associated with a feature module.

This function removes the module's action handlers from the internal registry,
effectively disabling those actions from being handled after the module is destroyed.

## Parameters

### module

[`FeatureModule`](../interfaces/FeatureModule.md)

The feature module whose action handlers should be removed.

## Returns

`void`
