# 🧬 Mutations: Drafts, Commits, and Tracked Selectors

Version 5 rebuilt the inside of the store: action handlers now write through mutable drafts, commits are transactional, and selectors track exactly the state they read. The result is less boilerplate, fewer wasted selector runs, and no spread-operator gymnastics.

**Upgrading from 4.x requires no changes to your code.** The public API is unchanged, and handlers that return replacement state keep working exactly as before. The new draft style is opt-in, one handler at a time.

## ✍️ Mutate the draft, return nothing

Action handlers and global reducers receive a temporary proxy draft of their state slice. Mutate it and return nothing — that is the whole handler:

```typescript
import { action } from '@epikodelabs/actionstack';

const addItem = action('ADD_ITEM', (state: { items: string[] }, item: string) => {
  state.items.push(item);
});

const setUser = action('SET_USER', (state: { user: User | null }, user: User) => {
  state.user = user;
});
```

The old style still works. Return replacement state when that reads better — for example when the slice itself is a primitive:

```typescript
const increment = action('increment', (state: number, amount: number) => state + amount);
```

Two rules keep transactions unambiguous:

- **Mutate or return — never both.** A handler that mutates its draft and also returns replacement state throws.
- **Do not retain the draft.** Drafts are revoked when the handler settles; touching one afterwards throws. Copy out the data you need, not the proxy.

## 🧱 How commits work

Everything a handler writes is journaled privately while the action runs. Nothing is visible to the rest of the application until the action succeeds.

- **One commit per action.** The slice handler and every global reducer run against the same batch; their writes commit together after all of them settle.
- **Failures stay contained.** A global reducer that throws loses only its own writes. Stages that succeeded earlier in the same action are retained.
- **Commits update in place.** Existing objects and arrays are updated where they live rather than being cloned into new references. A reference you hold to state observes later commits.
- **Explicit replacements replace.** Assigning a whole new value to a property (or returning replacement state) swaps the value in place of the old one.

The in-place model is why mutable handlers cannot be combined with the `storeFreeze` meta-reducer: committing means writing to existing state objects, and frozen objects refuse those writes.

## 🎯 Selectors rerun only for what they read

Store-backed selectors — `store.select(...)` and module `data$` accessors — now track the state paths each evaluation actually reads. When a commit lands, a selector reruns only if one of the changed paths overlaps something it read. A selector reading `state.user.name` ignores a commit that touched `state.items`.

Two emission rules follow from in-place commits:

- **Object selections emit on nested changes.** If a selector returns an object from state and a property inside it is committed, subscribers fire even though the reference is identical. You no longer need to rebuild references to be notified.
- **Primitive results still suppress equal values.** Selectors returning numbers, strings, and booleans dedupe as before.

Arrays get conservative treatment: any change beneath an array — its `length`, one index, or iteration over it — invalidates selectors reading that array. Individual array operations are not exposed as public patches, so a `push` and a manual `length` bump look the same to dependents.

## ⏳ Async selectors and dispatch

Async selectors read live state, so an evaluation can observe commits that landed after its `await`. When a commit arrives while an evaluation is still pending, the pending result is discarded and a fresh evaluation takes its place when it settles — subscribers never receive a value computed from stale state.

With `awaitStatePropagation: true`, dispatch additionally waits for selector evaluations and delivery to their sources, followed by the browser idle boundary. Arbitrary asynchronous effects you start inside subscribers are not awaited.

## 🚧 The rules of state

The mutation engine tracks writes by path, which requires state to be a plain tree:

- **Plain objects, arrays, and native collections.** Cycles, shared mutable references, and accessor properties (getters/setters) are rejected with explicit errors, including inside Map keys/values and Set members.
- **Mutate only inside handlers.** Never mutate state outside a handler, never mutate from a selector, and never keep a handler's draft.

## 🗺️ Map, Set, and Date values

`Map`, `Set`, and `Date` values live in state as first-class citizens. Handlers mutate them through their own methods, and selectors read them through theirs:

```typescript
const rename = action('RENAME', (state: { byId: Map<string, User> }, id: string, name: string) => {
  state.byId.get(id).name = name; // nested writes are tracked too
});
const expire = action('EXPIRE', (state: { until: Date }) => {
  state.until.setMonth(state.until.getMonth() + 1);
});
```

| Type | Reads | Mutations | Selector invalidation |
| --- | --- | --- | --- |
| `Map` | `get`, `has`, `size`, iteration | `set`, `delete`, `clear` | Entire map |
| `Set` | `has`, `size`, iteration | `add`, `delete`, `clear` | Entire set |
| `Date` | Getters and formatting methods | `setTime`, `setDate`, other setters | Entire date |

Inside a handler, these methods operate on a private copy that is journaled with the rest of the action and replayed onto the original instance at commit — the same visibility rules as everything else: nothing escapes until the action succeeds, and a failed stage rolls its collection operations back. Map values and Set members are wrapped as well, so writing through `map.get('user').name = ...` is tracked rather than escaping the transaction.

Each successful reducer stage carries its nested member edits into the next stage's working state. Map keys retain their committed identity for lookup. Draft collection methods and iterators expire when the reducer finishes, including extracted method references. Replacement collections recursively unwrap draft members before commit.

Native collections must not have custom own properties. Collection subclasses remain opaque alongside other class instances. Object-valued Map keys and Set members follow the same no-cycles/no-aliases rule as other state objects.

Selectors reading a collection invalidate as a whole, matching arrays: a selector that calls `map.get('user')` reruns when anything in that map changes. Iteration reads (`keys`, `values`, `entries`, `forEach`) also depend on the entire collection. Returned Map, Set, and Date values are plain committed instances, not proxies.

Class instances and accessor-based values remain opaque: their methods can touch private fields or cause external side effects that proxies cannot reliably intercept, so replace the whole value instead of mutating it.

## 🛣️ Upgrading from 4.x

Nothing to do. Install the new version and your existing code runs: handlers that return state, global reducers, selectors, and thunks all keep their contracts. Two behavioral notes worth knowing:

- Selectors that return whole state objects now re-emit when nested properties change, even without a reference change. If you relied on reference inequality to filter emissions, rely on the value instead.
- Commits write in place, so state references remain stable across updates. Memoization keyed on state identity should key on content.

When you want the shorter syntax, convert a handler by deleting the spread and returning nothing — the draft does the rest.
