# Function: createQueue()

> **createQueue**(): `object`

Defined in: [queue.ts:12](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/queue.ts#L12)

Creates an asynchronous queue that processes operations sequentially.
Operations are guaranteed to run in the order they are enqueued, one after another.
This is useful for preventing race conditions and ensuring that dependent
asynchronous tasks are executed in a specific order.

## Returns

`object`

An object representing the queue.

### enqueue()

> **enqueue**: \<`T`\>(`operation`, `options?`) => `Promise`\<`T`\>

#### Type Parameters

##### T

`T` = `any`

#### Parameters

##### operation

() => `T` \| `Promise`\<`T`\>

##### options?

###### inlineIfRunning?

`boolean`

#### Returns

`Promise`\<`T`\>

### pending

#### Get Signature

> **get** **pending**(): `number`

##### Returns

`number`

### isEmpty

#### Get Signature

> **get** **isEmpty**(): `boolean`

##### Returns

`boolean`
