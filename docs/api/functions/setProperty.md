# Function: setProperty()

## Call Signature

> **setProperty**\<`TObj`, `TValue`\>(`obj`, `path`, `value`): `TValue`

Defined in: [utils.ts:65](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/utils.ts#L65)

Sets a property in an object based on a path.

### Type Parameters

#### TObj

`TObj`

#### TValue

`TValue`

### Parameters

#### obj

`TObj`

The object to update.

#### path

`"*"`

The path to the property (e.g., "key" or ["user", "name"]).

#### value

`TValue`

The new value to set at the specified path.

### Returns

`TValue`

The updated object.

## Call Signature

> **setProperty**\<`TObj`, `TValue`\>(`obj`, `path`, `value`): `TValue`

Defined in: [utils.ts:70](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/utils.ts#L70)

Sets a property in an object based on a path.

### Type Parameters

#### TObj

`TObj`

#### TValue

`TValue`

### Parameters

#### obj

`TObj`

The object to update.

#### path

readonly \[\]

The path to the property (e.g., "key" or ["user", "name"]).

#### value

`TValue`

The new value to set at the specified path.

### Returns

`TValue`

The updated object.

## Call Signature

> **setProperty**\<`TObj`\>(`obj`, `path`, `value`): `TObj`

Defined in: [utils.ts:75](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/utils.ts#L75)

Sets a property in an object based on a path.

### Type Parameters

#### TObj

`TObj`

### Parameters

#### obj

`TObj`

The object to update.

#### path

The path to the property (e.g., "key" or ["user", "name"]).

`string` | [`PropertyPath`](../type-aliases/PropertyPath.md)

#### value

`any`

The new value to set at the specified path.

### Returns

`TObj`

The updated object.
