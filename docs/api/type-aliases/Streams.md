# Type Alias: Streams\<S\>

> **Streams**\<`S`\> = `{ [K in keyof S]: () => Stream<ReturnType<S[K]>> }`

Defined in: [types.ts:320](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L320)

Maps selector definitions to stream factory functions.

## Type Parameters

### S

`S` *extends* `Record`\<`string`, (`state`) => `any`\>
