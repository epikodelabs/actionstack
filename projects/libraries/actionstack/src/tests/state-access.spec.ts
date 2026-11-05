import { action, createModule, createStore } from '@epikodelabs/actionstack';

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

// Let runnable operations advance while the read remains explicitly gated.
const turn = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('exclusive state access', () => {
  beforeEach(() => { spyOn(console, 'log').and.stub(); });

  for (const preserveImmutableState of [true, false]) {
    for (const exclusiveActionProcessing of [true, false]) {
      describe(`immutable=${preserveImmutableState}, exclusive actions=${exclusiveActionProcessing}`, () => {
        it('blocks commits, module loading/unloading, and subsequent reads until the callback finishes', async () => {
          const store = createStore({
            preserveImmutableState, exclusiveActionProcessing, dispatchSystemActions: false,
          });
          const events: string[] = [];
          const counter = createModule({
            slice: 'counter', initialState: { count: 0 },
            actions: {
              increment: action('INCREMENT', (state: { count: number }) => {
                events.push('commit');
                state.count++;
              }),
            },
          });
          const added = createModule({ slice: 'added', initialState: { ready: true } });
          await store.loadModule(counter);
          const loaded = added.loaded$.subscribe(() => { events.push('load'); });
          const destroyed = counter.destroyed$.subscribe(() => { events.push('unload'); });
          const entered = gate();
          const release = gate();
          const read = store.getState('*', async state => {
            events.push('read:start');
            entered.resolve();
            await release.promise;
            expect(state['counter'].count).toBe(0);
            expect(state['added']).toBeUndefined();
            expect(counter.destroyed).toBeFalse();
            events.push('read:end');
          });
          await entered.promise;
          const commit = counter.actions.increment();
          const load = store.loadModule(added);
          const unload = store.unloadModule(counter, true);
          const followingRead = store.getState('*', state => {
            events.push('read:next');
            expect(state['counter']).toBeUndefined();
            expect(state['added']).toEqual({ ready: true });
          });
          try {
            await turn();
            expect(events).toEqual(['read:start']);
          } finally {
            release.resolve();
            await Promise.all([read, commit, load, unload, followingRead]);
            await loaded();
            await destroyed();
          }
          expect(events).toEqual(['read:start', 'read:end', 'commit', 'load', 'unload', 'read:next']);
        });

        it('waits for an earlier async reducer before entering the read', async () => {
          const store = createStore({
            preserveImmutableState, exclusiveActionProcessing, dispatchSystemActions: false,
          });
          const entered = gate();
          const release = gate();
          const counter = createModule({
            slice: 'counter', initialState: { count: 0 },
            actions: {
              increment: action('INCREMENT', async (state: { count: number }) => {
                entered.resolve();
                await release.promise;
                state.count++;
              }),
            },
          });
          await store.loadModule(counter);
          const commit = counter.actions.increment();
          await entered.promise;
          let readStarted = false;
          const read = store.getState<{ count: number }>('counter', state => {
            readStarted = true;
            expect(state.count).toBe(1);
          });
          try {
            await turn();
            expect(readStarted).toBeFalse();
          } finally {
            release.resolve();
            await Promise.all([commit, read]);
          }
          expect(readStarted).toBeTrue();
        });

        it('releases waiting lifecycle operations after an async read rejects', async () => {
          const store = createStore({
            preserveImmutableState, exclusiveActionProcessing, dispatchSystemActions: false,
          });
          const entered = gate();
          const release = gate();
          const added = createModule({ slice: 'added', initialState: { ready: true } });
          const failure = new Error('read failed');
          const read = store.getState('*', async () => {
            entered.resolve();
            await release.promise;
            throw failure;
          });
          const rejection = expectAsync(read).toBeRejectedWith(failure);
          await entered.promise;
          const load = store.loadModule(added);
          let followingReadRan = false;
          const followingRead = store.getState('*', state => {
            followingReadRan = true;
            expect(state['added']).toEqual({ ready: true });
          });
          try {
            await turn();
            expect(followingReadRan).toBeFalse();
          } finally {
            release.resolve();
            await Promise.all([rejection, load, followingRead]);
          }
          expect(followingReadRan).toBeTrue();
        });
      });
    }
  }
});
