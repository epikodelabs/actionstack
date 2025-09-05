<p align="center">
  <img src="https://github.com/actioncrew/actionstack/blob/master/LOGO.png?raw=true" alt="ActionStack Logo" width="800">
</p>

<p align="center">
  <strong>Next-generation state management for reactive applications</strong><br>
  Built on <a href="https://actioncrew.github.io/streamix" target="_blank" rel="external">Streamix</a> for ultimate performance and simplicity
</p>

<p align="center">
  <a href="https://github.com/actioncrew/actionstack/workflows/build/badge.svg">
    <img src="https://github.com/actioncrew/actionstack/workflows/build/badge.svg" alt="Build Status">
  </a>
  <a href="https://www.npmjs.com/package/@actioncrew/actionstack">
    <img src="https://img.shields.io/npm/v/@actioncrew/actionstack.svg?style=flat-square" alt="NPM Version">
  </a>
  <a href="https://www.npmjs.com/package/@actioncrew/actionstack">
    <img src="https://img.shields.io/npm/dm/@actioncrew/actionstack.svg?style=flat-square" alt="NPM Downloads">
  </a>
  <a href="https://bundlephobia.com/package/@actioncrew/actionstack">
    <img src="https://raw.githubusercontent.com/actioncrew/actionstack/v3/projects/libraries/actionstack/bundle-size.svg" alt="Bundle Size">
  </a>
  <a href="https://www.npmjs.com/package/@actioncrew/actionstack">
    <img src="https://img.shields.io/badge/AI-Powered-blue" alt="AI-Powered">
  </a>
</p>

---

## ✨ Key Features

- **🧩 Modular Architecture** — Feature-based modules with co-located state and logic
- **⚡ Reactive Streams** — Built on Streamix for high-performance reactive updates
- **🔄 Action Handlers** — No reducers needed - sync actions with state logic
- **⚡ Thunk Support** — Built-in async operations via thunks
- **🔒 Safe Concurrency** — Built-in locking and execution control
- **📦 Dynamic Loading** — Load/unload modules at runtime
- **🎯 Type Safety** — Full TypeScript support with intelligent inference

---

## 📦 Installation

```bash
npm install @actioncrew/actionstack
```

---

## 🚀 Quick Start

```typescript
import { createStore, createModule, action, thunk, selector } from '@actioncrew/actionstack';

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

## 🎯 Real-World Example

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

## 🔄 Advanced Features

### Static Module Loading
```typescript
let store = createStore();
registerModule(store, authModule, uiModule, settingsModule);
```

### Dynamic Module Loading
```typescript
// Load modules at runtime
const featureModule = createDashboardModule();
registerModule(store, featureModule);

// Unload when no longer needed and clear state
unregisterModule(store, true, featureModule);
```

### Stream Composition
```typescript
import { combineLatest, map, filter, eachValueFrom } from '@actioncrew/streamix';

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
  awaitStatePropagation: true,
  enableGlobalReducers: false,
  exclusiveActionProcessing: false
}, applyMiddleware(logger, devtools));
```

---

## 🔗 Why Query + Thunks = Perfect Match
The combination of Streamix's `query()` method and ActionStack's thunks creates a uniquely powerful and streamlined approach:

- **Reactive by default** — Subscribe to streams for UI updates
- **Imperative when needed** — Use query() for instant access in business logic
- **Consistent API** — Same selectors work for both reactive and imperative use
- **Type-safe** — Full TypeScript inference across reactive and sync access patterns
- **Performance optimized** — Query avoids subscription overhead for one-time reads

---

## 🆚 ActionStack vs Other Solutions

| Feature | ActionStack V3 | Redux + RTK | Zustand |
|---------|----------------|-------------|---------|
| Bundle Size | Minimal | Large | Small |
| Reactivity | Built-in | Manual | Manual |
| Modules | Native | Manual | Manual |
| Type Safety | Excellent | Good | Good |
| Async Actions | Native | Thunks | Manual |

---

## 📚 Resources
- **[API Documentation](https://actioncrew.github.io/actionstack/api)**
- **[GitHub Repository](https://github.com/actioncrew/actionstack)**
- **[Community support](https://github.com/actioncrew/actionstack/discussions)**
- **[Streamix: Reactive foundation](https://www.npmjs.com/package/@actioncrew/streamix)**

---

<p align="center">
  <strong>Ready for next-gen state management? 🚀</strong><br>
  <a href="https://www.npmjs.com/package/@actioncrew/actionstack">Install from NPM</a> • 
  <a href="https://github.com/actioncrew/actionstack">View on GitHub</a>
</p>
