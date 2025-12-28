# actionstack
Next-generation state management for reactive applications.
Built on Streamix for ultimate performance and simplicity.

<p align="center">
  <img src="https://github.com/epikodelabs/actionstack/blob/main/LOGO.png?raw=true" alt="actionstack logo" width="500">
</p>

<p align="center">
  <a href="https://github.com/epikodelabs/actionstack/actions/workflows/build.yml">
    <img src="https://github.com/epikodelabs/actionstack/actions/workflows/build.yml/badge.svg?branch=main" alt="Build Status">
  </a>
  <a href="https://www.npmjs.com/package/@epikodelabs/actionstack">
    <img src="https://img.shields.io/npm/v/@epikodelabs/actionstack.svg?style=flat-square" alt="NPM Version">
  </a>
  <a href="https://www.npmjs.com/package/@epikodelabs/actionstack">
    <img src="https://img.shields.io/npm/dm/@epikodelabs/actionstack.svg?style=flat-square" alt="NPM Downloads">
  </a>
  <a href="https://bundlephobia.com/package/@epikodelabs/actionstack">
    <img src="https://raw.githubusercontent.com/epikodelabs/actionstack/main/projects/libraries/actionstack/bundle-size.svg" alt="Bundle Size">
  </a>
  <a href="https://www.npmjs.com/package/@epikodelabs/actionstack">
    <img src="https://img.shields.io/badge/AI-Powered-blue" alt="AI-Powered">
  </a>
</p>

---

## Give a Star on GitHub

If actionstack helps you, please give it a star: https://github.com/epikodelabs/actionstack

---

## Key Features

- **Modular Architecture** - Feature-based modules with co-located state and logic
- **Reactive Streams** - Built on Streamix for high-performance reactive updates
- **Action Handlers** - No reducers needed - sync actions with state logic
- **Thunk Support** - Built-in async operations via thunks
- **Safe Concurrency** - Built-in locking and execution control
- **Dynamic Loading** - Load/unload modules at runtime
- **Type Safety** - Full TypeScript support with intelligent inference

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

---

## Real-World Example

```typescript
interface TodoState {
  todos: Todo[];
  loading: boolean;
}

const addTodo = action('add', 
  (state: TodoState, text: string) => ({
    ...state,
    todos: [...state.todos, { id: Date.now(), text, completed: false }]
  })
);

const setTodos = action('setTodos',
  (state: TodoState, todos: Todo[]) => ({ ...state, todos, loading: false })
);

const setLoading = action('setLoading',
  (state: TodoState, loading: boolean) => ({ ...state, loading })
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
import { combineLatest, map, filter, eachValueFrom } from '@epikodelabs/streamix';

// Combine data from multiple modules
const dashboardData$ = combineLatest([
  userModule.data$.selectCurrentUser(),
  todoModule.data$.selectActiveTodos(),
  notificationModule.data$.selectUnread()
]).pipe(
  map(([user, todos, notifications]) => ({
    user,
    todoCount: todos.length,
    hasNotifications: notifications.length > 0
  }))
);

// React to combined state changes
for await (const data of eachValueFrom(dashboardData$)) {
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

## Why Query + Thunks = Perfect Match
The combination of Streamix's `query()` method and actionstack's thunks creates a uniquely powerful and streamlined approach:

- **Reactive by default** - Subscribe to streams for UI updates
- **Imperative when needed** - Use query() for instant access in business logic
- **Consistent API** - Same selectors work for both reactive and imperative use
- **Type-safe** - Full TypeScript inference across reactive and sync access patterns
- **Performance optimized** - Query avoids subscription overhead for one-time reads

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

---

<p align="center">
  <strong>Ready for next-gen state management?</strong><br>
  <a href="https://www.npmjs.com/package/@epikodelabs/actionstack">Install from NPM</a>
  <a href="https://github.com/epikodelabs/actionstack">View on GitHub</a>
</p>
