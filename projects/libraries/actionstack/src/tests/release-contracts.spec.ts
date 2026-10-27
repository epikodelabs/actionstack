import { action, createModule, createStore, thunk } from '@epikodelabs/actionstack';
import type { Action, ActionCreator, Dispatch } from '@epikodelabs/actionstack';

// These assertions are intentionally checked by tsc, rather than executed.
function contracts(dispatch: Dispatch) {
  const module = createModule({ slice: 'contracts', initialState: 0, actions: {
    inc: action('INC', (n: number) => n + 1),
    result: thunk('RESULT', (value: number) => async () => value),
  } });
  const number: Promise<number> = module.actions.result(42);
  // @ts-expect-error Bound thunk results cannot be assigned to another type.
  const string: Promise<string> = module.actions.result(42);
  const done: Promise<void> = module.actions.inc();
  // @ts-expect-error A bound action does not return a pure action object.
  const event: Action = module.actions.inc();
  // @ts-expect-error Bound methods cannot be used as pure action creators.
  const creator: ActionCreator = module.actions.inc;
  const nested: Promise<number> = dispatch(async child => child(async () => 42));
  const type: string = module.actions.inc.type;
  void [number, string, done, event, creator, nested, type];
}
void contracts;

describe('release public contracts', () => {
  it('keeps nested dependencies separate from the shared root and from array peers', async () => {
    spyOn(console, 'log').and.stub();
    const service = () => 42;
    const module = createModule({ slice: 'dependencies', initialState: 0, actions: {}, dependencies: {
      api: { endpoint: '/users', request: service },
      rows: [{ id: 1 }, { id: 2 }],
    } });
    const store = createStore();
    await store.loadModule(module);
    const dependencies = store.middlewareAPI.dependencies();
    expect(dependencies).toEqual({ api: { endpoint: '/users', request: service }, rows: [{ id: 1 }, { id: 2 }] });
    expect(dependencies.api).not.toBe(dependencies);
    expect(dependencies.rows[0]).not.toBe(dependencies.rows[1]);
    expect(dependencies.endpoint).toBeUndefined();
  });

  it('retains a committed module when a post-install observer throws', async () => {
    spyOn(console, 'log').and.stub();
    spyOn(console, 'warn').and.stub();
    const store = createStore();
    const module = createModule({ slice: 'observer', initialState: 1, actions: {} });
    spyOn(module.loaded$, 'next').and.throwError('observer failed');
    await store.loadModule(module);
    expect(store.middlewareAPI.getState('observer')).toBe(1);
    expect(console.warn).toHaveBeenCalled();
  });
});
