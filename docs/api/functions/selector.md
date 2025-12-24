# Function: selector()

## Call Signature

> **selector**\<`S1`, `R`\>(`s1`): [`Selector`](../type-aliases/Selector.md)\<`StateOf`\<`S1`\>, `ResultOf`\<`S1`\>\>

Defined in: [selectors.ts:46](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/selectors.ts#L46)

Variadic selector creator.

Rules:
- selector(fn)                     → projection / identity
- selector(a, projector)           → derived
- selector(a, b, projector)        → derived

The state type is inferred from the FIRST selector.

### Type Parameters

#### S1

`S1` *extends* `AnySelector`

#### R

`R`

### Parameters

#### s1

`S1`

### Returns

[`Selector`](../type-aliases/Selector.md)\<`StateOf`\<`S1`\>, `ResultOf`\<`S1`\>\>

## Call Signature

> **selector**\<`S1`, `R`\>(`s1`, `projector`): [`Selector`](../type-aliases/Selector.md)\<`StateOf`\<`S1`\>, `R`\>

Defined in: [selectors.ts:53](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/selectors.ts#L53)

Variadic selector creator.

Rules:
- selector(fn)                     → projection / identity
- selector(a, projector)           → derived
- selector(a, b, projector)        → derived

The state type is inferred from the FIRST selector.

### Type Parameters

#### S1

`S1` *extends* `AnySelector`

#### R

`R`

### Parameters

#### s1

`S1`

#### projector

(`r1`) => `R`

### Returns

[`Selector`](../type-aliases/Selector.md)\<`StateOf`\<`S1`\>, `R`\>

## Call Signature

> **selector**\<`S1`, `S2`, `R`\>(`s1`, `s2`, `projector`): [`Selector`](../type-aliases/Selector.md)\<`StateOf`\<`S1`\>, `R`\>

Defined in: [selectors.ts:61](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/selectors.ts#L61)

Variadic selector creator.

Rules:
- selector(fn)                     → projection / identity
- selector(a, projector)           → derived
- selector(a, b, projector)        → derived

The state type is inferred from the FIRST selector.

### Type Parameters

#### S1

`S1` *extends* `AnySelector`

#### S2

`S2` *extends* `AnySelector`

#### R

`R`

### Parameters

#### s1

`S1`

#### s2

`S2`

#### projector

(`r1`, `r2`) => `R`

### Returns

[`Selector`](../type-aliases/Selector.md)\<`StateOf`\<`S1`\>, `R`\>

## Call Signature

> **selector**\<`S1`, `S2`, `S3`, `R`\>(`s1`, `s2`, `s3`, `projector`): [`Selector`](../type-aliases/Selector.md)\<`StateOf`\<`S1`\>, `R`\>

Defined in: [selectors.ts:71](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/selectors.ts#L71)

Variadic selector creator.

Rules:
- selector(fn)                     → projection / identity
- selector(a, projector)           → derived
- selector(a, b, projector)        → derived

The state type is inferred from the FIRST selector.

### Type Parameters

#### S1

`S1` *extends* `AnySelector`

#### S2

`S2` *extends* `AnySelector`

#### S3

`S3` *extends* `AnySelector`

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

(`r1`, `r2`, `r3`) => `R`

### Returns

[`Selector`](../type-aliases/Selector.md)\<`StateOf`\<`S1`\>, `R`\>

## Call Signature

> **selector**\<`S1`, `S2`, `S3`, `S4`, `R`\>(`s1`, `s2`, `s3`, `s4`, `projector`): [`Selector`](../type-aliases/Selector.md)\<`StateOf`\<`S1`\>, `R`\>

Defined in: [selectors.ts:83](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/selectors.ts#L83)

Variadic selector creator.

Rules:
- selector(fn)                     → projection / identity
- selector(a, projector)           → derived
- selector(a, b, projector)        → derived

The state type is inferred from the FIRST selector.

### Type Parameters

#### S1

`S1` *extends* `AnySelector`

#### S2

`S2` *extends* `AnySelector`

#### S3

`S3` *extends* `AnySelector`

#### S4

`S4` *extends* `AnySelector`

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

(`r1`, `r2`, `r3`, `r4`) => `R`

### Returns

[`Selector`](../type-aliases/Selector.md)\<`StateOf`\<`S1`\>, `R`\>
