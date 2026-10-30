<p align="center">
  <img src="https://raw.githubusercontent.com/epikodelabs/epikodelabs.github.io/refs/heads/main/actionstack/LOGO.png" alt="Actionstack" width="420">
</p>

<h3 align="center">State management without the ceremony.</h3>

<p align="center">
  Mutable state. Immutable snapshots. Precise reactivity.<br>
  Transactional updates and feature-oriented architecture, powered by Streamix.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@epikodelabs/actionstack"><img src="https://img.shields.io/npm/v/@epikodelabs/actionstack.svg?style=flat-square&color=0ea5e9" alt="npm version"></a>
  <a href="https://codecov.io/gh/epikodelabs/actionstack"><img src="https://codecov.io/gh/epikodelabs/actionstack/graph/badge.svg?style=flat-square" alt="coverage"></a>
  <a href="https://github.com/epikodelabs/actionstack/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="MIT License"></a>
</p>

<p align="center">
  <a href="https://epikodelabs.github.io/actionstack">Documentation</a> ·
  <a href="https://epikodelabs.github.io/actionstack/api">API Reference</a> ·
  <a href="https://github.com/epikodelabs/actionstack/discussions">Discussions</a> ·
  <a href="https://github.com/epikodelabs/actionstack/issues">Issues</a>
</p>

## Why Actionstack?

State management shouldn't require copying objects just to tell your application something changed.

Actionstack combines **mutable state, transactional updates, and dependency-tracked selectors** in a modular architecture built on [Streamix](https://github.com/epikodelabs/streamix).

* **Mutate naturally.** Update objects and arrays without spreading or cloning state.
* **Commit atomically.** Changes are staged and applied transactionally.
* **Preserve references.** In-place mutations retain existing object identities.
* **React precisely.** Selectors track dependencies and update only when relevant state changes.
* **Keep immutable snapshots.** Capture isolated, read-only state histories for debugging.
* **Organize by feature.** Group state, actions, selectors, and dependencies into modules.
* **Handle async work.** Coordinate asynchronous workflows with thunks and injected services.

**Less copying. Less orchestration. More application logic.**

## Get started

```bash
npm install @epikodelabs/actionstack @epikodelabs/streamix
```

### 1. Define a feature

```typescript
import {
  action,
  createModule,
  createStore,
  selector
} from '@epikodelabs/actionstack';

interface CounterState {
  count: number;
}

const increment = action(
  'increment',
  (state: CounterState, amount: number) => {
    state.count += amount;
  }
);

const counter = createModule({
  slice: 'counter',
  initialState: { count: 0 },

  actions: { increment },

  selectors: {
    count: selector((state: CounterState) => state.count),
    doubled: selector((state: CounterState) => state.count * 2)
  }
});

const store = createStore();

await store.loadModule(counter);
```

No reducers to maintain. No immutable updates to construct.

Actions describe changes directly.

### 2. Observe reactive state

```typescript
const unsubscribe = counter.data$.doubled().subscribe(
  value => console.log('Doubled:', value)
);

await counter.actions.increment(5); // Doubled: 10
await counter.actions.increment(3); // Doubled: 16
```

Selectors automatically track the state they read.

When a mutation commits, Actionstack identifies affected dependencies and propagates relevant updates through Streamix.

### 3. Clean up

```typescript
await unsubscribe();
await store.unloadModule(counter, true);
```

Modules own their features and can be loaded or unloaded dynamically.

## Mutable state. Immutable snapshots.

Actionstack separates **how state changes** from **how changes are observed**.

### Mutable by design

```typescript
const updateUser = action(
  'updateUser',
  (state: UserState, name: string) => {
    state.user.profile.name = name;
  }
);
```

Action handlers receive temporary proxy drafts.

Mutations are recorded, validated, and committed transactionally. Existing objects and arrays are updated in place, preserving their references.

If processing fails before commit, staged changes are not partially applied to live state.

### Immutable when it matters

Live state remains mutable through controlled actions, while logging tools can capture independent, deeply frozen snapshots.

| Live state                    | Immutable snapshots              |
| ----------------------------- | -------------------------------- |
| Updated transactionally       | Capture historical values        |
| Preserves object identity     | Preserve historical contents     |
| Supports reactive observation | Support debugging and inspection |
| Avoids unnecessary cloning    | Created when needed              |

**Mutability for execution. Immutability for history.**

### Precise reactivity

Consider two selectors:

```typescript
const name = selector(
  (state: UserState) => state.user.name
);

const age = selector(
  (state: UserState) => state.user.age
);
```

Changing `user.name` doesn't require reevaluating a selector that only depends on `user.age`.

Actionstack tracks accessed state paths and uses recorded mutations to invalidate affected selectors.

No manual dependency declarations. No reference comparisons required to detect changes.

## Async work belongs in the feature

Thunks coordinate asynchronous operations using dispatch, state access, and injected dependencies.

```typescript
import { thunk } from '@epikodelabs/actionstack';

const saveUser = thunk(
  'saveUser',
  (user: User) =>
    async (_dispatch, _getState, dependencies) => {
      await dependencies.api.save(user);
    }
);
```

Register the thunk in a module's `actions` and provide its dependencies through the module configuration.

Module action methods return promises, allowing callers to await processing and handle failures.

## Under the hood

| Concept             | Responsibility                                                 |
| ------------------- | -------------------------------------------------------------- |
| **Store**           | Coordinate state, dispatch, middleware, and feature lifecycles |
| **Module**          | Group state, actions, selectors, and dependencies              |
| **Action**          | Describe a state transition                                    |
| **Mutation engine** | Track changes and commit them transactionally                  |
| **Selector**        | Derive values from tracked state dependencies                  |
| **Thunk**           | Coordinate asynchronous workflows                              |
| **Streamix**        | Provide the reactive foundation                                |

Actionstack supports configurable execution behavior, including exclusive action processing, global reducers, and state-propagation waiting.

The mutation engine avoids traversing untouched state during ordinary commits and supports constant-time no-op dispatches.

## Use it where you build

Actionstack is framework-independent at its core.

| Entry point                        | Includes                                        |
| ---------------------------------- | ----------------------------------------------- |
| `@epikodelabs/actionstack`         | Store, modules, actions, selectors, thunks      |
| `@epikodelabs/actionstack/angular` | Angular signal integration                      |
| `@epikodelabs/actionstack/tools`   | Logging, state freezing, performance middleware |

The repository includes Angular and React demonstration applications.

Streamix provides the reactive foundation without requiring a particular UI framework.

## Learn more

* [Full documentation](https://epikodelabs.github.io/actionstack)
* [API reference](https://epikodelabs.github.io/actionstack/api)
* [Mutation guide](https://github.com/epikodelabs/actionstack/blob/main/docs/MUTATIONS.md)
* [Streamix documentation](https://epikodelabs.github.io/streamix)
* [Source code](https://github.com/epikodelabs/actionstack)

## Come build with us

Have an interesting state-management challenge, an async edge case, or an idea for improving the mutation engine? We'd love to hear about it.

* [Start a discussion](https://github.com/epikodelabs/actionstack/discussions) for questions and ideas.
* [Open an issue](https://github.com/epikodelabs/actionstack/issues) with a reproducible problem.
* [Star the repository](https://github.com/epikodelabs/actionstack) if Actionstack helps you.

**Write changes. Not copies.**

## License

MIT

Optional commercial support, consulting, and custom development are available under separate agreements.

[Pricing](https://epikodelabs.github.io/actionstack/PRICING) · [Terms](https://epikodelabs.github.io/actionstack/TERMS-OF-SERVICE) · [Privacy](https://epikodelabs.github.io/actionstack/PRIVACY-POLICY)
