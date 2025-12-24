# Type Alias: ThunkTrigger\<TAction\>

> **ThunkTrigger**\<`TAction`\> = `string` \| (`action`) => `boolean`

Defined in: [types.ts:97](https://github.com/epikodelabs/actionstack/blob/v3/projects/libraries/actionstack/src/lib/types.ts#L97)

Defines the trigger types supported by thunks.

- `string`: matches an action by its `type`
- `(action) => boolean`: custom predicate matcher

## Type Parameters

### TAction

`TAction` *extends* [`Action`](../interfaces/Action.md)\<`any`\> = [`Action`](../interfaces/Action.md)\<`any`\>
