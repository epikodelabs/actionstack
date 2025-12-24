# Function: selectorAsync()

## Call Signature

> **selectorAsync**\<`S1`, `R`\>(`s1`): (`state`) => `Promise`\<[`ResultOf`](../type-aliases/ResultOf.md)\<`S1`\>\>

Defined in: [selectors.ts:143](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/selectors.ts#L143)

Async variadic selector creator.

Rules:
- selectorAsync(fn)                     → async projection
- selectorAsync(a, asyncProjector)      → async derived
- selectorAsync(a, b, asyncProjector)   → async derived

Input selectors are synchronous.
Only the projector may be async.

### Type Parameters

#### S1

`S1` *extends* [`AnySelector`](../type-aliases/AnySelector.md)

#### R

`R`

### Parameters

#### s1

`S1`

### Returns

> (`state`): `Promise`\<[`ResultOf`](../type-aliases/ResultOf.md)\<`S1`\>\>

#### Parameters

##### state

[`StateOf`](../type-aliases/StateOf.md)\<`S1`\>

#### Returns

`Promise`\<[`ResultOf`](../type-aliases/ResultOf.md)\<`S1`\>\>

## Call Signature

> **selectorAsync**\<`S1`, `R`\>(`s1`, `projector`): (`state`) => `Promise`\<`R`\>

Defined in: [selectors.ts:150](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/selectors.ts#L150)

Async variadic selector creator.

Rules:
- selectorAsync(fn)                     → async projection
- selectorAsync(a, asyncProjector)      → async derived
- selectorAsync(a, b, asyncProjector)   → async derived

Input selectors are synchronous.
Only the projector may be async.

### Type Parameters

#### S1

`S1` *extends* [`AnySelector`](../type-aliases/AnySelector.md)

#### R

`R`

### Parameters

#### s1

`S1`

#### projector

(`r1`) => `Promise`\<`R`\>

### Returns

> (`state`): `Promise`\<`R`\>

#### Parameters

##### state

[`StateOf`](../type-aliases/StateOf.md)\<`S1`\>

#### Returns

`Promise`\<`R`\>

## Call Signature

> **selectorAsync**\<`S1`, `S2`, `R`\>(`s1`, `s2`, `projector`): (`state`) => `Promise`\<`R`\>

Defined in: [selectors.ts:158](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/selectors.ts#L158)

Async variadic selector creator.

Rules:
- selectorAsync(fn)                     → async projection
- selectorAsync(a, asyncProjector)      → async derived
- selectorAsync(a, b, asyncProjector)   → async derived

Input selectors are synchronous.
Only the projector may be async.

### Type Parameters

#### S1

`S1` *extends* [`AnySelector`](../type-aliases/AnySelector.md)

#### S2

`S2` *extends* [`AnySelector`](../type-aliases/AnySelector.md)

#### R

`R`

### Parameters

#### s1

`S1`

#### s2

`S2`

#### projector

(`r1`, `r2`) => `Promise`\<`R`\>

### Returns

> (`state`): `Promise`\<`R`\>

#### Parameters

##### state

[`StateOf`](../type-aliases/StateOf.md)\<`S1`\>

#### Returns

`Promise`\<`R`\>

## Call Signature

> **selectorAsync**\<`S1`, `S2`, `S3`, `R`\>(`s1`, `s2`, `s3`, `projector`): (`state`) => `Promise`\<`R`\>

Defined in: [selectors.ts:168](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/selectors.ts#L168)

Async variadic selector creator.

Rules:
- selectorAsync(fn)                     → async projection
- selectorAsync(a, asyncProjector)      → async derived
- selectorAsync(a, b, asyncProjector)   → async derived

Input selectors are synchronous.
Only the projector may be async.

### Type Parameters

#### S1

`S1` *extends* [`AnySelector`](../type-aliases/AnySelector.md)

#### S2

`S2` *extends* [`AnySelector`](../type-aliases/AnySelector.md)

#### S3

`S3` *extends* [`AnySelector`](../type-aliases/AnySelector.md)

#### R

`R`

### Parameters

#### s1

`S1`

#### s2

`S2`

#### s3

`S3`

#### projector

(`r1`, `r2`, `r3`) => `Promise`\<`R`\>

### Returns

> (`state`): `Promise`\<`R`\>

#### Parameters

##### state

[`StateOf`](../type-aliases/StateOf.md)\<`S1`\>

#### Returns

`Promise`\<`R`\>

## Call Signature

> **selectorAsync**\<`S1`, `S2`, `S3`, `S4`, `R`\>(`s1`, `s2`, `s3`, `s4`, `projector`): (`state`) => `Promise`\<`R`\>

Defined in: [selectors.ts:180](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/selectors.ts#L180)

Async variadic selector creator.

Rules:
- selectorAsync(fn)                     → async projection
- selectorAsync(a, asyncProjector)      → async derived
- selectorAsync(a, b, asyncProjector)   → async derived

Input selectors are synchronous.
Only the projector may be async.

### Type Parameters

#### S1

`S1` *extends* [`AnySelector`](../type-aliases/AnySelector.md)

#### S2

`S2` *extends* [`AnySelector`](../type-aliases/AnySelector.md)

#### S3

`S3` *extends* [`AnySelector`](../type-aliases/AnySelector.md)

#### S4

`S4` *extends* [`AnySelector`](../type-aliases/AnySelector.md)

#### R

`R`

### Parameters

#### s1

`S1`

#### s2

`S2`

#### s3

`S3`

#### s4

`S4`

#### projector

(`r1`, `r2`, `r3`, `r4`) => `Promise`\<`R`\>

### Returns

> (`state`): `Promise`\<`R`\>

#### Parameters

##### state

[`StateOf`](../type-aliases/StateOf.md)\<`S1`\>

#### Returns

`Promise`\<`R`\>
