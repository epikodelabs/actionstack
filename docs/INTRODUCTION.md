# actionstack
Next-generation state management for reactive applications.

Built on <a href="https://epikodelabs.github.io/streamix" target="_blank" rel="noopener">streamix</a> for ultimate performance and simplicity.

<p align="center">
  <img src="https://raw.githubusercontent.com/epikodelabs/epikodelabs.github.io/refs/heads/main/actionstack/LOGO.png" alt="actionstack logo" width="500">
</p>

<div
  align="center"
  style="display:flex; justify-content:center; gap:0.5rem; flex-wrap:wrap;"
>
  <a href="https://www.npmjs.com/package/@epikodelabs/actionstack"><img src="https://img.shields.io/npm/v/@epikodelabs/actionstack.svg?style=flat-square&color=0ea5e9" alt="npm version"></a>
  <a href="https://codecov.io/gh/epikodelabs/actionstack"><img src="https://codecov.io/gh/epikodelabs/actionstack/graph/badge.svg?style=flat-square" alt="coverage"></a>
  <a href="https://bundlephobia.com/package/@epikodelabs/actionstack">
    <img src="https://raw.githubusercontent.com/epikodelabs/epikodelabs.github.io/161dea3e83f7bb6c27dcee0e33d615ba91cc5c5b/actionstack/bundle-size.svg" alt="Bundle Size">
  </a>
</div>

---

## Give a Star on GitHub

If actionstack helps you, please give it a star: https://github.com/epikodelabs/actionstack

---

## Key Features

- **Modular Architecture** - Feature-based modules with co-located state and logic
- **Reactive Streams** - Built on Streamix for high-performance reactive updates
- **Action Handlers** - No reducers needed - sync actions with state logic
- **Mutable Drafts** - Mutate a draft inside your handler; commits are transactional and in place
- **Tracked Selectors** - Selectors rerun only when the state they actually read changes
- **Thunk Support** - Built-in async operations via thunks
- **Safe Concurrency** - Built-in locking and execution control
- **Dynamic Loading** - Load/unload modules at runtime
- **Type Safety** - Full TypeScript support with intelligent inference

> **New in v5:** action handlers write through mutable drafts and selectors track their reads.
> Upgrading from 4.x requires no changes to your code — see the [Mutations guide](/MUTATIONS).

---

## Installation

```bash
npm install @epikodelabs/actionstack
```

---

## Quick Start

```typescript
import { createStore, createModule, action, thunk, selector } from '@epikodelabs/actionstack';

// Actions with built-in state handlers
const increment = action('increment', 
  (state: number, payload: number = 1) => state + payload
);

const reset = action('reset', () => 0);

// Create module
const counterModule = createModule({
  slice: 'counter',
  initialState: 0,
  actions: { increment, reset },
  selectors: {
    count: selector((state: number) => state),
  }
});

// Initialize
const store = createStore();
counterModule.init(store);

// Use actions directly
counterModule.actions.increment(5);  // Counter: 5
counterModule.actions.reset();       // Counter: 0

// Subscribe to changes
counterModule.data$.count().subscribe(count => {
  console.log('Counter:', count);
});
```

This slice holds a number, so the handler returns replacement state. Slices holding objects or arrays can simply mutate the draft instead — see the [Mutations guide](/MUTATIONS).

---

## Real-World Example

```typescript
interface TodoState {
  todos: Todo[];
  loading: boolean;
}

// v5 draft style: mutate the state, return nothing
const addTodo = action('add',
  (state: TodoState, text: string) => {
    state.todos.push({ id: Date.now(), text, completed: false });
  }
);

const setTodos = action('setTodos',
  (state: TodoState, todos: Todo[]) => {
    state.todos = todos;
    state.loading = false;
  }
);

const setLoading = action('setLoading',
  (state: TodoState, loading: boolean) => {
    state.loading = loading;
  }
);

// Thunk using createThunk
const fetchTodos = thunk('fetchTodos', () => 
  (dispatch, getState, dependencies) => {
    todoModule.actions.setLoading(true);
    
    dependencies.todoService.fetchTodos()
      .then(todos => todoModule.actions.setTodos(todos))
      .catch(error => {
        todoModule.actions.setLoading(false);
        console.error('Failed to fetch todos:', error);
      });
  }
);

// Selectors
const selectActiveTodos = selector(
  (state: TodoState) => state.todos.filter(t => !t.completed)
);

// Module with dependencies
const todoModule = createModule({
  slice: 'todos',
  initialState: { todos: [], loading: false },
  actions: { addTodo, setTodos, setLoading, fetchTodos },
  selectors: { selectActiveTodos },
  dependencies: { todoService: new TodoService() }
});

// Usage
registerModule(store, todoModule);
todoModule.actions.fetchTodos();

// Reactive UI updates
todoModule.data$.selectActiveTodos().subscribe(activeTodos => {
  renderTodos(activeTodos);
});
```

---

## Advanced Features

### Static Module Loading
```typescript
let store = createStore();
populateStore(store, authModule, uiModule, settingsModule);
```

### Dynamic Module Loading
```typescript
// Load modules at runtime
const featureModule = createDashboardModule();
registerModule(store, featureModule);

// Unload when no longer needed and clear state
unregisterModule(store, featureModule, true);
```

### Stream Composition
```typescript
import { combineLatest, map, pipe } from '@epikodelabs/streamix';

// Combine data from multiple modules
const dashboardData$ = pipe(
  combineLatest(
    userModule.data$.selectCurrentUser(),
    todoModule.data$.selectActiveTodos(),
    notificationModule.data$.selectUnread()
  ),
  map(([user, todos, notifications]) => ({
    user,
    todoCount: todos.length,
    hasNotifications: notifications.length > 0
  }))
);

// React to combined state changes
for await (const data of dashboardData$) {
  updateDashboard(data);
}
```

### Store Configuration
```typescript
const store = createStore({
  dispatchSystemActions: true,
  enableGlobalReducers: false,
  exclusiveActionProcessing: false
}, applyMiddleware(logger, devtools));
```

---

## Why Atoms + Thunks = Perfect Match
The combination of Streamix atoms and actionstack's thunks creates a streamlined reactive workflow:

- **Reactive by default** - Subscribe to atoms for UI updates
- **Imperative when needed** - Use `firstValueFrom(atom)` for one-time reads
- **Consistent API** - Same selectors work for both reactive and imperative use
- **Type-safe** - Full TypeScript inference across reactive and sync access patterns
- **Performance optimized** - Shared sources avoid duplicate selector work

---

## actionstack vs Other Solutions

| Feature | actionstack | Redux + RTK | Zustand |
| --- | --- | --- | --- |
| Bundle Size | Minimal | Large | Small |
| Reactivity | Built-in | Manual | Manual |
| Modules | Native | Manual | Manual |
| Type Safety | Excellent | Good | Good |
| Async Actions | Native | Thunks | Manual |

---

## Resources
- **[API Documentation](https://epikodelabs.github.io/actionstack/api)**
- **[GitHub Repository](https://github.com/epikodelabs/actionstack)**
- **[Community support](https://github.com/epikodelabs/actionstack/discussions)**
- **[Streamix: Reactive foundation](https://www.npmjs.com/package/@epikodelabs/streamix)**

## Licensing and Legal
- **[License: MIT](https://github.com/epikodelabs/actionstack/blob/main/LICENSE)**
- **[Pricing](/PRICING)**
- **[Terms of Service](/TERMS-OF-SERVICE)**
- **[Privacy Policy](/PRIVACY-POLICY)**
- **[Refund Policy](/REFUND-POLICY)**

actionstack is open-source software available at no charge under the MIT License. Optional paid support, consulting, and custom delivery are available by separate written agreement.

---

<p align="center">
  <strong>Ready for next-gen state management?</strong><br>
  <a href="https://www.npmjs.com/package/@epikodelabs/actionstack">Install from NPM</a>
  <a href="https://epikodelabs.github.io">View on GitHub</a>
</p>
