<p align="center">
  <img src="https://raw.githubusercontent.com/epikodelabs/epikodelabs.github.io/refs/heads/main/actionstack/LOGO.png" alt="Actionstack" width="380">
</p>

<p align="center">
  <strong>Build, explore, and contribute to Actionstack.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@epikodelabs/actionstack"><img src="https://img.shields.io/npm/v/@epikodelabs/actionstack.svg?style=flat-square&color=0ea5e9" alt="npm version"></a>
  <a href="https://codecov.io/gh/epikodelabs/actionstack"><img src="https://codecov.io/gh/epikodelabs/actionstack/graph/badge.svg?style=flat-square" alt="coverage"></a>
  <a href="https://github.com/epikodelabs/actionstack/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="license"></a>
</p>

# Getting started

This repository contains the Actionstack source code, framework integrations, demonstration applications, and development tooling.

**New to Actionstack?** Start with the [library README](projects/libraries/actionstack/README.md) for installation, examples, and the state-management model.

This guide covers working with the source repository.

## Workspace

Actionstack is organized as a monorepo containing the core library and example applications.

```text
projects/
├── libraries/
│   └── actionstack/
│       ├── src/lib/
│       │   ├── store.ts
│       │   ├── module.ts
│       │   ├── actions.ts
│       │   ├── selectors.ts
│       │   ├── tracked-selectors.ts
│       │   ├── current-source.ts
│       │   ├── queue.ts
│       │   ├── starter.ts
│       │   ├── angular.ts
│       │   └── types.ts
│       └── tools/
│           └── src/lib/
└── apps/
    ├── app1/                  # Angular application
    └── app2/                  # React + Vite application
```

### Core library

The library is organized around several implementation areas:

| Area                   | Responsibility                                  |
| ---------------------- | ----------------------------------------------- |
| `store.ts`             | Store lifecycle, dispatch, and coordination     |
| `module.ts`            | Feature registration and module lifecycle       |
| `actions.ts`           | Action creators, thunks, and registries         |
| `selectors.ts`         | Selector definitions and composition            |
| `tracked-selectors.ts` | Dependency tracking and selective notifications |
| `current-source.ts`    | Current-value reactive sources                  |
| `queue.ts`             | Action execution queue                          |
| `starter.ts`           | Thunk middleware                                |
| `angular.ts`           | Angular signal interoperability                 |

The mutation engine implements transactional draft processing and in-place commits.

For its public behavior and usage patterns, see the [Mutation Guide](docs/MUTATIONS.md).

## Set up the repository

Clone Actionstack:

```bash
git clone https://github.com/epikodelabs/actionstack.git
cd actionstack
npm install
```

Use the Node.js and TypeScript versions supported by the workspace configuration.

The repository includes library projects and applications that can be built and tested independently through their configured workspace targets.

## Explore the applications

Two applications demonstrate Actionstack in different environments.

### Angular — `app1`

The Angular application demonstrates how Actionstack modules and reactive selectors integrate with Angular components.

Explore it to understand:

* Feature module organization
* Store initialization and module loading
* Action dispatch from components
* Reactive state consumption
* Angular integration patterns

Application sources:

`projects/apps/app1/`

### React — `app2`

The React application uses Vite and demonstrates how Actionstack can operate independently of Angular.

It provides a reference for:

* Framework-independent feature modules
* React integration with reactive state
* Action-driven state updates
* Application-level state organization

Application sources:

`projects/apps/app2/`

### Working with the examples

Start with an existing application, inspect its module definitions, and follow the state flow:

**Component → Action → Transaction → State → Selector → Component**

This is the most useful path for understanding how Actionstack connects application logic to rendering.

## Development workflow

The repository includes automated tests and benchmarks covering the core runtime behavior.

When making changes, focus on the affected subsystem and its related tests.

### Mutation engine

Changes to transactional mutation handling should preserve:

* Correct draft isolation and revocation
* Consistent commits
* Stable references for in-place mutations
* Correct handling of replacement state
* Failure isolation
* Accurate changed-path reporting

### Selectors

Changes to selector tracking should verify:

* Dependency collection
* Nested property access
* Selective invalidation
* Updates after mutations
* Subscription cleanup

### Async execution

Changes to action processing and thunks should cover:

* Dispatch ordering
* Promise completion and rejection
* Nested dispatch
* Exclusive execution
* Propagation and settlement behavior

## Performance

Actionstack includes a dedicated mutation benchmark.

Run it from the repository root:

```bash
npm run benchmark:mutations
```

The benchmark helps evaluate draft creation, mutation tracking, finalization, and commit overhead.

When optimizing the runtime, compare performance before and after changes and check that improvements do not compromise transactional correctness.

Particular attention should be given to large state trees, no-op actions, and mutations affecting only a small portion of application state.

## Testing

Before submitting changes:

1. Run the tests associated with the modified library or application.
2. Add regression tests for corrected behavior.
3. Verify affected framework integrations.
4. Run mutation benchmarks when changing performance-sensitive code.
5. Check compatibility with the supported Streamix version.

Use the test and build targets defined in the workspace configuration.

## Contributing

Contributions are welcome across the core library, framework integrations, testing, documentation, and developer tooling.

For bug reports, include a minimal reproduction and the affected package version.

For architectural changes, open a discussion before making substantial API modifications.

* [Issues](https://github.com/epikodelabs/actionstack/issues)
* [Discussions](https://github.com/epikodelabs/actionstack/discussions)
* [Pull requests](https://github.com/epikodelabs/actionstack/pulls)

## Documentation

| Resource                                                       | Description                               |
| -------------------------------------------------------------- | ----------------------------------------- |
| [Library README](projects/libraries/actionstack/README.md)     | Installation and API examples             |
| [Documentation](https://epikodelabs.github.io/actionstack)     | Guides and concepts                       |
| [API reference](https://epikodelabs.github.io/actionstack/api) | Public API documentation                  |
| [Mutation guide](docs/MUTATIONS.md)                            | Transactional mutation behavior           |
| [Changelog](docs/CHANGELOG.md)                                 | Release history and compatibility changes |
| [Streamix](https://github.com/epikodelabs/streamix)            | Underlying reactive runtime               |

## License

MIT
