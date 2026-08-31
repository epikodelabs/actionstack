# ✨ React + Streamix + ActionStack

Welcome to the fun zone: React for the UI, Streamix for the dataflow, and ActionStack for the orchestration. This combo keeps the interface predictable, the streams honest, and the business rules organized, so the whole app feels like a single rhythm section rather than three bands trying to sync on the fly.

---

## ✨ Why this trio works

- **React** owns the DOM and the render loop. Every update should be predictable and declarative.
- **Streamix** keeps async primitives readable, cancel-safe, and composable without reshaping React's mental model.
- **ActionStack** runs workflows (side effects, mutations, command dispatches) that result from user intent or background signals.

With React focused on view state, Streamix modeling transient data, and ActionStack owning the commands, each layer can do its job without stepping on the others' toes.

---

## ✨ Typical flow

1. **User triggers an intent** inside a React component (clicks a button, inputs text, kernel event).
2. React fires an action creator that feeds Streamix (usually via a `Subject`, `fromEvent`, or custom adapter).
3. Streamix operators apply debouncing, filtering, branching, or cancellation rules while still streaming rich payloads.
4. ActionStack receives parsed intents, executes the business logic, and emits a completion or error action.
5. The completion action feeds back into Streamix (via another stream or state update) and React rerenders with consistent UI.

This tight cycle lets you follow the signal from user intent to workflow execution to rendered result with minimal impedance mismatch.

---

## ✨ Pattern: React hooks + Streamix + ActionStack

```tsx
import { addListener, debounce, filter, map, pipe } from '@epikodelabs/streamix';
import { useLayoutEffect, useRef, useState } from 'react';
import { searchModule } from '../modules/search';

function SearchComponent() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (!inputRef.current) return;

    const stream = pipe(
      addListener(inputRef.current, 'input'),
      map((ev: Event) => (ev.target as HTMLInputElement).value.trim()),
      filter(query => query.length >= 3),
      debounce(250)
    );

    // Subscribe to search results and loading state from module
    const resultsSub = searchModule.data$.results().subscribe(items => {
      setResults(items);
    });
    
    const loadingSub = searchModule.data$.loading().subscribe(isLoading => {
      setLoading(isLoading);
    });

    // Process input stream and dispatch actions
    (async () => {
      for await (const query of stream) {
        // Call the ActionStack thunk - it handles state updates internally
        await searchModule.actions.performSearch(query);
      }
    })();

    return () => {
      resultsSub();
      loadingSub();
    };
  }, []);

  return (
    <div>
      <input ref={inputRef} placeholder="Search..." />
      {loading && <div>Loading...</div>}
      <ResultsList items={results} />
    </div>
  );
}
```

Streamix keeps the event handling declarative and cancellable, while ActionStack exposes the workflow you care about (`search-workflow`, in this case). React only interprets the status/result so the component stays tidy.

---

## ✨ Structuring the project

```
src/
├── store/
│   └── index.ts                 # ✨ Store creation and module registration
├── modules/
│   ├── search.module.ts         # ✨ Search module (all-in-one)
│   ├── user.module.ts           # ✨ User module
│   └── cart.module.ts           # ✨ Cart module
├── components/
│   └── SearchInput.tsx          # ✨ React component (UI + Streamix)
└── services/
    └── api.ts                   # ✨ Shared API utilities (optional)
```

Keep the action definitions (ActionStack) isolated from the React components; hand them a small payload and let the stack orchestrate retries, compensations, and downstream events. Streamix sits between them, shaping the signal with `map`, `filter`, `tap`, `debounce`, and `pipe`.

---

## ✨ Testing & Observability: Treat Async as a Script, Not a Simulation

Consumption-based async logic makes tests and traces deterministic: you consume streams, observe which actions execute, and replay inputs to reproduce bugs. No time simulation, no marble diagrams, no hidden causality — execution tells the story.

---

## ✨ Final thoughts

React, Streamix, and ActionStack is a trio built for clarity. React never grabs a `Promise` it shouldn't, Streamix choreographs the asynchronous dance, and ActionStack runs repeatable business workflows. When you wire them consciously, you get a resilient feedback loop that stays fun, even as the app scales.
