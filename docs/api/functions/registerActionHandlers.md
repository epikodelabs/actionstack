# Function: registerActionHandlers()

> **registerActionHandlers**(`module`): `void`

Defined in: [actions.ts:53](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/actions.ts#L53)

Registers all action handlers defined in a feature module into the global action handler map.

This function iterates over the module's actions and adds their handlers to an internal
registry used for dispatching. If a handler is already registered for the same action type,
a warning is logged and the existing handler is overwritten.

## Parameters

### module

[`FeatureModule`](../interfaces/FeatureModule.md)

The feature module containing actions with associated handlers.

## Returns

`void`
