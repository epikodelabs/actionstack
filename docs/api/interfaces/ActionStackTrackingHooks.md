# Interface: ActionStackTrackingHooks

Defined in: [types.ts:434](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L434)

Hooks that allow observing ActionStack execution without coupling
ActionStack core to tracing, testing utilities, or diagnostics.

These hooks are intentionally minimal and synchronous.

## Methods

### track()?

> `optional` **track**(`subscription`): `void`

Defined in: [types.ts:438](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L438)

Called when a subscription is created and should be tracked.

#### Parameters

##### subscription

`Subscription`

#### Returns

`void`

***

### signal()?

> `optional` **signal**(`subscription`): `void`

Defined in: [types.ts:444](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L444)

Called when user code (subscriber callback, reducer, effect)
was actually executed.

#### Parameters

##### subscription

`Subscription`

#### Returns

`void`

***

### complete()?

> `optional` **complete**(`subscription`): `void`

Defined in: [types.ts:449](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L449)

Called when a subscription has completed and will no longer emit.

#### Parameters

##### subscription

`Subscription`

#### Returns

`void`
