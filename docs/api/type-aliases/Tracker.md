# Type Alias: Tracker

> **Tracker** = `object`

Defined in: [types.ts:402](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L402)

Tracker used in tests to wait until all in-flight stream emissions have reached
a terminal tracing state.

Why tracing?
- Some values never reach subscriber callbacks (filtered/collapsed/errored).
- Using tracing lets us wait for the *pipeline* to settle, not just callbacks.

Notes:
- This implementation intentionally does NOT rely on internal/private tracer fields.
- It treats the world as "test-scoped": when you call `waitAll()`, it waits until
  *all traces currently known by the tracer* are terminal.

## Properties

### timeout

> **timeout**: `number`

Defined in: [types.ts:404](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L404)

Maximum time to wait for the stream graph to settle (ms).

***

### state()

> **state**: (`subscription`) => `boolean`

Defined in: [types.ts:407](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L407)

Returns current boolean state for the subscription (if tracked).

#### Parameters

##### subscription

`Subscription`

#### Returns

`boolean`

***

### signal()

> **signal**: (`subscription`) => `void`

Defined in: [types.ts:410](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L410)

Signals that a tracked subscription executed some callback work.

#### Parameters

##### subscription

`Subscription`

#### Returns

`void`

***

### complete()

> **complete**: (`subscription`) => `void`

Defined in: [types.ts:413](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L413)

Marks subscription as complete and removes it from the tracker.

#### Parameters

##### subscription

`Subscription`

#### Returns

`void`

***

### track()

> **track**: (`subscription`) => `void`

Defined in: [types.ts:416](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L416)

Adds a subscription to tracking (no-op if already tracked).

#### Parameters

##### subscription

`Subscription`

#### Returns

`void`

***

### reset()

> **reset**: () => `void`

Defined in: [types.ts:419](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L419)

Resets internal statuses and clears collected traces.

#### Returns

`void`

***

### waitAll()

> **waitAll**: () => [`CancelablePromise`](CancelablePromise.md)\<`void`\>

Defined in: [types.ts:425](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L425)

Waits until tracing shows no in-flight values (no "emitted"/"processing").
Calls are queued: each new call waits for the previous waitAll to finish.

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<`void`\>
