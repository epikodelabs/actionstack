# Type Alias: ValueAtPath\<T, P\>

> **ValueAtPath**\<`T`, `P`\> = `P` *extends* readonly \[\] ? `T` : `P` *extends* readonly \[infer K, `...(infer Rest)`\] ? `K` *extends* keyof `T` ? `ValueAtPath`\<`T`\[`K`\], `Extract`\<`Rest`, readonly `any`[]\>\> : `unknown` : `unknown`

Defined in: [selectors.ts:27](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/selectors.ts#L27)

Recursively resolves the type of a deeply nested property based on a path array.

- []        -> T
- ['a']     -> T['a']
- ['a','b'] -> T['a']['b']

## Type Parameters

### T

`T`

### P

`P` *extends* readonly `any`[]
