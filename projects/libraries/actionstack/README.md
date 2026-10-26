<p align="center">
  <img src="https://raw.githubusercontent.com/epikodelabs/epikodelabs.github.io/refs/heads/main/actionstack/LOGO.png" alt="Actionstack" width="420">
</p>

<h3 align="center">State, actions, and async work. One feature at a time.</h3>
<p align="center">
  Modules for features. Actions for changes. Selectors for views.<br>
  Built on Streamix to keep application state reactive and feature logic together.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@epikodelabs/actionstack"><img src="https://img.shields.io/npm/v/@epikodelabs/actionstack.svg?style=flat-square&color=0ea5e9" alt="npm version"></a>
  <a href="https://codecov.io/gh/epikodelabs/actionstack"><img src="https://codecov.io/gh/epikodelabs/actionstack/graph/badge.svg?style=flat-square" alt="coverage"></a>
</p>

<p align="center">
  <a href="https://epikodelabs.github.io/actionstack">Documentation</a> ·
  <a href="https://epikodelabs.github.io/actionstack/api">API reference</a> ·
  <a href="https://github.com/epikodelabs/actionstack/discussions">Discussions</a> ·
  <a href="https://github.com/epikodelabs/actionstack/issues">Issues</a>
</p>

## Why Actionstack?

Application state gets harder to follow when a feature's actions, async work, and derived data live in unrelated places.

Actionstack groups them into **feature modules**. Each module owns a state slice, action handlers, selectors, and dependencies. A store coordinates dispatch and module loading; Streamix supplies the reactive foundation.

- **Features have a home.** Keep state, actions, selectors, and dependencies together.
- **Actions describe changes.** Define a handler alongside its action creator instead of maintaining a separate reducer switch.
- **Selectors feed views.** Read selected state through reactive sources exposed by `data$`.
- **Thunks handle async work.** Use dispatch, state access, and injected dependencies inside an async action.
- **Modules can come and go.** Load features when needed and unload them when their work is done.
- **Stores stay isolated.** Each store has its own action and thunk registries.

Start with one feature. Add middleware and execution settings when the application needs them.

## Get started

### Mutable handlers and selective updates

Action handlers and global reducers receive a temporary proxy draft. Mutate it
and return nothing (or the draft), or return replacement state without mutating.
Existing 4.x handlers keep working unchanged; upgrading requires no code changes:

```ts
const addItem = action('ADD_ITEM', (state: { items: string[] }, item: string) => {
  state.items.push(item);
});
```

Writes stay private until the action succeeds. Committing updates existing
objects and arrays in place; explicit replacements replace their values.
Retained state references therefore observe later commits. Never mutate state
outside a handler, mutate state from a selector, or retain a handler's draft:
drafts are revoked when the handler finishes. A failing global reducer loses
its own writes while earlier successful stages are retained.

Store-backed custom selectors track their reads and rerun once per relevant
action. Whole-object selections emit after nested changes even if their reference
is unchanged. Primitive results still suppress equal values. Any change beneath
an array invalidates selectors reading that array, including `length`, an index,
or iteration; individual array operations are not exposed as public patches.

Async selectors read live state and can observe later commits after an `await`.
Commits while an evaluation is pending discard its result and coalesce into a
fresh evaluation when it settles. With `awaitStatePropagation: true`, dispatch
also waits for selector evaluations and delivery to their sources, followed by
the browser idle boundary; arbitrary asynchronous subscriber effects are not awaited.

State must be a tree of plain objects, arrays, `Map`, `Set`, and `Date` values
with data properties; cyclic or shared mutable references and accessors are
rejected. `Map`, `Set`, and `Date` support their read methods through proxies
and mutate through them inside handlers (`map.set`, `set.add`, `date.setMonth`),
with any change invalidating selectors reading that value as a whole. Class
instances and accessor-based values stay opaque: replace them instead of
mutating. Direct in-place commits require writable state; do not combine
mutable handlers with the `storeFreeze` meta-reducer.

Tree validation includes Map keys/values and Set members. Native collections
cannot have custom own properties; subclasses remain opaque. Draft methods and
iterators expire with their reducer, and nested member edits are visible to
later reducer stages before commit.

```bash
npm install @epikodelabs/actionstack @epikodelabs/streamix
```

Streamix is a peer dependency of Actionstack. The current package declares support for Streamix `^3.0.3`.

### 1. Define a feature

```ts
import {
  action,
  createModule,
  createStore,
  selector,
} from '@epikodelabs/actionstack';

const increment = action(
  'increment',
  (state: number, amount: number) => state + amount,
);

const counter = createModule({
  slice: 'counter',
  initialState: 0,
  actions: { increment },
  selectors: {
    count: selector((state: number) => state),
    doubled: selector((state: number) => state * 2),
  },
});

const store = createStore();
await store.loadModule(counter);

const unsubscribe = counter.data$.count().subscribe(value => {
  console.log('Count:', value);
});

counter.actions.increment(5);
```

Loading configures the module with its store. Module action calls dispatch automatically, so do not dispatch the same result a second time. The selector source supplies the current value and subsequent updates; consume it reactively rather than assuming dispatch has already updated every observer.

### 2. Derive what the view needs

The module already exposes `count` and `doubled`. Subscribe to the value the view needs:

```ts
const stopDoubled = counter.data$.doubled().subscribe(value => {
  console.log('Doubled:', value);
});
```

Selectors describe calculations over a module's state slice. Keep derived values in selectors instead of storing another copy that must be synchronized.

### 3. Give the feature a lifecycle

When the feature is removed, release its subscriptions and unload its state:

```ts
await unsubscribe();
await stopDoubled();
await store.unloadModule(counter, true);
```

Use `store.populate(...modules)` to load several features. The store's load, populate, and unload methods return promises when you need to await lifecycle completion. The convenience helpers `registerModule`, `populateStore`, and `unregisterModule` return module arrays instead.

## Let asynchronous work have a place

Use `thunk(type, factory)` for work that needs to wait, fetch, or coordinate multiple actions. The factory receives your arguments and returns a function with `dispatch`, `getState`, and `dependencies`:

```ts
import { createModule, thunk } from '@epikodelabs/actionstack';

const reportMessage = thunk('reportMessage', (message: string) =>
  async (_dispatch, _getState, dependencies) => {
    await dependencies.reporter.send(message);
  },
);

const reports = createModule({
  slice: 'reports',
  initialState: {},
  actions: { reportMessage },
  dependencies: {
    reporter: {
      async send(message: string) {
        console.log('Report:', message);
      },
    },
  },
});

await store.loadModule(reports);
reports.actions.reportMessage('Counter feature is ready');
```

Replace the example reporter with your application service. Returning or awaiting asynchronous work inside the thunk lets the store observe its completion. Thunks also support action triggers; see the API reference for execution and error-handling details.

## Under the hood

| Concept | Responsibility |
| --- | --- |
| **Store** | Coordinate state, dispatch, feature registration, and middleware. |
| **Module** | Group one state slice with its actions, selectors, and dependencies. |
| **Action** | Describe a change and provide its state handler. |
| **Selector** | Project state into values a consumer needs. |
| **Thunk** | Run asynchronous logic with access to dispatch, state, and dependencies. |
| **Streamix** | Supply the reactive sources beneath store and selector updates. |

Store settings include `awaitStatePropagation`, `dispatchSystemActions`, `enableGlobalReducers`, and `exclusiveActionProcessing`. Choose execution behavior explicitly when sequencing matters; check the API reference before relying on a particular concurrency policy.

## Packages and project structure

| Entry point | Includes |
| --- | --- |
| `@epikodelabs/actionstack` | Store, feature modules, actions, thunks, selectors, middleware utilities, and Angular's `atomToSignal` helper. |
| `@epikodelabs/actionstack/tools` | Logging, state-freezing, and performance middleware. |

Angular helpers currently ship from the core entry point. The repository also contains a React demo; it does not define separate `/react` or `/vue` package entry points.

```text
projects/
├── libraries/
│   └── actionstack/
│       ├── src/lib/
│       │   ├── store.ts           # Store and dispatch coordination
│       │   ├── module.ts          # Feature registration and lifecycle
│       │   ├── actions.ts         # Action creators, thunks, and registries
│       │   ├── selectors.ts       # Selector composition
│       │   ├── current-source.ts  # Current-value reactive sources
│       │   ├── queue.ts           # Execution queue
│       │   ├── starter.ts         # Thunk middleware
│       │   ├── angular.ts         # Angular signal bridge
│       │   └── types.ts           # Shared contracts
│       └── tools/src/lib/         # Logger, freeze, and performance tools
└── apps/
    ├── app1/                      # Angular demo
    └── app2/                      # React + Vite demo
```

## Learn more

- [Full documentation](https://epikodelabs.github.io/actionstack)
- [API reference](https://epikodelabs.github.io/actionstack/api)
- [Streamix documentation](https://epikodelabs.github.io/streamix) — the reactive foundation
- [Source code](https://github.com/epikodelabs/actionstack)

## Come build with us

Have a feature that is awkward to model, an async edge case, or a useful example? We'd like to hear about it.

- [Start a discussion](https://github.com/epikodelabs/actionstack/discussions) for questions and ideas.
- [Open an issue](https://github.com/epikodelabs/actionstack/issues) with a minimal reproduction for bugs.
- [Star the repository](https://github.com/epikodelabs/actionstack) if Actionstack helps you.

## License and support

Actionstack is available at no charge under the [MIT License](https://github.com/epikodelabs/actionstack/blob/main/LICENSE). Optional paid support, consulting, and custom delivery are available by separate written agreement.

[Pricing](https://epikodelabs.github.io/actionstack/PRICING) · [Terms of Service](https://epikodelabs.github.io/actionstack/TERMS-OF-SERVICE) · [Privacy Policy](https://epikodelabs.github.io/actionstack/PRIVACY-POLICY) · [Refund Policy](https://epikodelabs.github.io/actionstack/REFUND-POLICY)
