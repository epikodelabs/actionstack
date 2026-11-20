# 🛠️ ActionStack Tools: Your App’s Rad Crew

ActionStack packs a punch with its built-in tools—Logger, Performance Monitor, and State Freezer. They’re like your app’s personal hype squad: one’s sniffing out bugs, another’s keeping things speedy, and the last one’s guarding your state like it’s the VIP lounge.

## 🧩 Middleware: The ActionStack Checkpoint

These tools roll as **middleware**, acting like bouncers at the club:

    action → starter → middleware chain → store.dispatch → new state

Every **action** gets a quick vibe check before it can slide into the dispatch and update your app’s state.

### Why Middleware?

Middleware hooks into your dispatch to keep things tight. Set it up like this:

```ts
import { createStore, applyMiddleware } from '@epikodelabs/actionstack';
import { logger, perfmon, storeFreeze } from '@epikodelabs/actionstack/tools';

export const store = createStore(applyMiddleware(logger, perfmon, storeFreeze));
```

Middleware installed with `applyMiddleware` receives dispatch and the other
middleware services by default. If a middleware needs to read current state,
import `withMiddlewareState` and install it with
`applyMiddleware(withMiddlewareState(myMiddleware))`. The built-in logger
already opts in.

When an action hits:
1. **Logger** scribbles what’s up in the console.
2. **Performance Monitor** clocks the speed.
3. **State Freezer** locks down any shady state changes.
4. Then, the action cruises to the dispatch method.

Middleware can pass, tweak, or (rarely) block actions, but these tools mostly just watch and keep things smooth.

## ⚡ The Lineup

### 1. Logger
Your debugging wingman, catching every move.

- Logs action details (name, type, payload) and state changes.
- Spots bugs or weird side effects.
- Offers log levels—chill `info` or loud `error`.

### 2. Performance Monitor
The speed junkie making sure your app doesn’t lag.

- Times actions and state updates.
- Flags anything slowing down the party.
- Drops metrics to boost performance.

### 3. State Freezer
The state’s bodyguard, keeping it untouchable.

- Blocks sneaky state edits.
- Throws errors if someone tries to mess with it.
- Ensures your app stays predictable.

## ⚙️ Getting Started

Snag ActionStack:

```bash
npm install @epikodelabs/actionstack
```

Then, plug in the tools:

```ts
import { createStore, applyMiddleware } from '@epikodelabs/actionstack';
import { logger, storeFreeze } from '@epikodelabs/actionstack/tools';

export const store = createStore(applyMiddleware(logger, storeFreeze));
```

## 🎬 Wrap-Up

Logger, Performance Monitor, and State Freezer are your app’s all-star crew, posted up between actions and `store.dispatch`. They track, time, and protect, so your app stays slick and stress-free. 

*“You won’t lose your mind if you use the right tools in the right place. Because, seriously, who needs the chaos of a buggy app when you’ve got this squad?” 🌟🚀*

