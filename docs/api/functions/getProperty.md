# Function: getProperty()

## Call Signature

> **getProperty**\<`TObj`\>(`obj`, `path`): `TObj`

Defined in: [utils.ts:11](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/utils.ts#L11)

Retrieves a property from an object based on a path.

### Type Parameters

#### TObj

`TObj`

### Parameters

#### obj

`TObj`

The object to retrieve the property from.

#### path

`"*"`

The path to the property (e.g., "key" or ["user", "name"]).

### Returns

`TObj`

The value of the property or `undefined` if the path is invalid.

## Call Signature

> **getProperty**\<`TObj`, `K`\>(`obj`, `path`): `NonNullable`\<`TObj`\>\[`K`\] \| `undefined`

Defined in: [utils.ts:12](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/utils.ts#L12)

Retrieves a property from an object based on a path.

### Type Parameters

#### TObj

`TObj`

#### K

`K` *extends* `string` \| `number` \| `symbol`

### Parameters

#### obj

`TObj`

The object to retrieve the property from.

#### path

`K`

The path to the property (e.g., "key" or ["user", "name"]).

### Returns

`NonNullable`\<`TObj`\>\[`K`\] \| `undefined`

The value of the property or `undefined` if the path is invalid.

## Call Signature

> **getProperty**\<`TObj`\>(`obj`, `path`): `unknown`

Defined in: [utils.ts:16](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/utils.ts#L16)

Retrieves a property from an object based on a path.

### Type Parameters

#### TObj

`TObj`

### Parameters

#### obj

`TObj`

The object to retrieve the property from.

#### path

The path to the property (e.g., "key" or ["user", "name"]).

`"*"` | [`PropertyPath`](../type-aliases/PropertyPath.md)

### Returns

`unknown`

The value of the property or `undefined` if the path is invalid.
