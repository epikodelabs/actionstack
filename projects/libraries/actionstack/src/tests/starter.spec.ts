import type { Action } from '@actioncrew/actionstack';
import {
  createLock,
  createStarter,
  registerThunks,
  thunk,
  unregisterThunks,
} from '@actioncrew/actionstack';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type HarnessOptions = {
  nextHook?: (action: Action) => Promise<void> | void;
};

function createHarness(strategyName: string, opts: HarnessOptions = {}) {
  const lock = createLock();
  const starterMw = createStarter();

  const received: Action[] = [];
  let inNext = false;
  const overlaps: string[] = [];

  const next = async (action: Action) => {
    if (inNext) overlaps.push(action.type);
    inNext = true;
    try {
      received.push(action);
      await opts.nextHook?.(action);
    } finally {
      inNext = false;
    }
  };

  const dispatch = starterMw({
    getState: () => ({}),
    dependencies: () => ({}),
    lock,
    strategy: () => strategyName,
  } as any)(next);

  return { dispatch, received, overlaps };
}

describe('Starter middleware', () => {
  const cleanupModules: any[] = [];

  const registerTestModule = (actions: Record<string, any>) => {
    const module = { actions } as any;
    registerThunks(module);
    cleanupModules.push(module);
    return module;
  };

  afterEach(() => {
    while (cleanupModules.length) {
      unregisterThunks(cleanupModules.pop());
    }
  });

  describe('triggers', () => {
    it('triggers registered thunks when a string trigger matches', async () => {
      const t1 = thunk(
        'TEST/STRING_TRIGGER',
        () => async (dispatch) => {
          await dispatch({ type: 'SIDE_EFFECT' });
        },
        ['PING']
      );

      const t2 = thunk(
        'TEST/STRING_TRIGGER_NO_MATCH',
        () => async (dispatch) => {
          await dispatch({ type: 'SHOULD_NOT_RUN' });
        },
        ['PONG']
      );

      registerTestModule({ t1, t2 });

      const { dispatch, received } = createHarness('exclusive');
      await dispatch({ type: 'PING' });

      expect(received.map(a => a.type)).toEqual(['PING', 'SIDE_EFFECT']);
    });

    it('supports predicate triggers', async () => {
      const predicate = (action: any) => action?.payload?.run === true;

      const t1 = thunk(
        'TEST/PRED_TRIGGER',
        () => async (dispatch) => {
          await dispatch({ type: 'SIDE_EFFECT' });
        },
        [predicate]
      );

      registerTestModule({ t1 });

      const { dispatch, received } = createHarness('exclusive');
      await dispatch({ type: 'ANY', payload: { run: true } });

      expect(received.map(a => a.type)).toEqual(['ANY', 'SIDE_EFFECT']);
    });

    it('ignores trigger predicate errors (treats as non-match)', async () => {
      const badPredicate = () => {
        throw new Error('bad predicate');
      };

      const t1 = thunk(
        'TEST/BAD_PRED_TRIGGER',
        () => async (dispatch) => {
          await dispatch({ type: 'SHOULD_NOT_RUN' });
        },
        [badPredicate]
      );

      registerTestModule({ t1 });

      const { dispatch, received } = createHarness('exclusive');
      await dispatch({ type: 'PING' });

      expect(received.map(a => a.type)).toEqual(['PING']);
    });

    it('ignores thunks with empty triggers', async () => {
      const t1 = thunk(
        'TEST/EMPTY_TRIGGERS',
        () => async (dispatch) => {
          await dispatch({ type: 'SHOULD_NOT_RUN' });
        },
        []  // Empty array
      );

      registerTestModule({ t1 });

      const { dispatch, received } = createHarness('exclusive');
      await dispatch({ type: 'PING' });

      expect(received.map(a => a.type)).toEqual(['PING']);  // No side effect
    });
  });

  describe('strategy selection', () => {
    it('falls back to default strategy and warns on unknown strategy', async () => {
      const warn = spyOn(console, 'warn');

      const { dispatch, received } = createHarness('not-a-strategy');
      await dispatch({ type: 'PING' });

      expect(received.map(a => a.type)).toEqual(['PING']);
      expect(warn).toHaveBeenCalled();
      expect(String(warn.calls.mostRecent().args[0])).toContain(
        '[starter] Unknown strategy:'
      );
    });

    it('warns and falls back when strategy() returns a non-string value', async () => {
      const warn = spyOn(console, 'warn');

      const { dispatch, received } = createHarness({} as any);
      await dispatch({ type: 'PING' });

      expect(received.map(a => a.type)).toEqual(['PING']);
      expect(warn).toHaveBeenCalled();
      expect(String(warn.calls.mostRecent().args[0])).toContain('[object Object]');
    });
  });

  describe('execution strategy', () => {
    it('runs matching thunks sequentially in exclusive mode', async () => {
      const events: string[] = [];
      const t1Started = deferred<void>();
      const allowT1Finish = deferred<void>();

      const t1 = thunk(
        'TEST/EXCL_1',
        () => async () => {
          events.push('t1-start');
          t1Started.resolve();
          await allowT1Finish.promise;
          events.push('t1-end');
        },
        ['PING']
      );

      const t2 = thunk(
        'TEST/EXCL_2',
        () => async () => {
          events.push('t2-start');
          events.push('t2-end');
        },
        ['PING']
      );

      registerTestModule({ t1, t2 });

      const { dispatch } = createHarness('exclusive');
      const p = dispatch({ type: 'PING' });

      await t1Started.promise;
      expect(events).toEqual(['t1-start']);

      allowT1Finish.resolve();
      await p;

      expect(events).toEqual(['t1-start', 't1-end', 't2-start', 't2-end']);
    });

    it('runs matching thunks concurrently in concurrent mode', async () => {
      const events: string[] = [];
      const t1Started = deferred<void>();
      const t2Started = deferred<void>();
      const allowFinish = deferred<void>();

      const t1 = thunk(
        'TEST/CONC_1',
        () => async () => {
          events.push('t1-start');
          t1Started.resolve();
          await allowFinish.promise;
          events.push('t1-end');
        },
        ['PING']
      );

      const t2 = thunk(
        'TEST/CONC_2',
        () => async () => {
          events.push('t2-start');
          t2Started.resolve();
          await allowFinish.promise;
          events.push('t2-end');
        },
        ['PING']
      );

      registerTestModule({ t1, t2 });

      const { dispatch } = createHarness('concurrent');
      const p = dispatch({ type: 'PING' });

      await Promise.all([t1Started.promise, t2Started.promise]);
      expect(events).toEqual(jasmine.arrayContaining(['t1-start', 't2-start']));
      expect(events).not.toContain('t1-end');
      expect(events).not.toContain('t2-end');

      allowFinish.resolve();
      await p;

      const lastStartIndex = Math.max(
        events.indexOf('t1-start'),
        events.indexOf('t2-start')
      );
      const firstEndIndex = Math.min(
        events.indexOf('t1-end'),
        events.indexOf('t2-end')
      );

      expect(lastStartIndex).toBeGreaterThanOrEqual(0);
      expect(firstEndIndex).toBeGreaterThanOrEqual(0);
      expect(lastStartIndex).toBeLessThan(firstEndIndex);
    });

    it('propagates errors from matching thunks without crashing', async () => {
      const warn = spyOn(console, 'warn');
      const errorThunk = thunk(
        'TEST/ERROR_THUNK',
        () => async () => { throw new Error('thunk error'); },
        ['PING']
      );

      registerTestModule({ errorThunk });

      const { dispatch } = createHarness('concurrent');
      const p = dispatch({ type: 'PING' });

      await p;  // Should resolve without crashing middleware
      expect(warn).toHaveBeenCalled();
      expect(String(warn.calls.mostRecent().args[0])).toContain(
        '[starter] [concurrent] Thunk error while processing action "PING": thunk error'
      );
    });
  });

  describe('concurrent utilities', () => {
    it('exposes pendingCount and waitForAll', async () => {
      const { dispatch: dispatchFn } = createHarness('concurrent');
      const dispatch = dispatchFn as any;  // Access properties

      expect(typeof dispatch.pendingCount).toBe('function');
      expect(typeof dispatch.waitForAll).toBe('function');

      // Test pendingCount
      const p1 = dispatch({ type: 'PING' });
      expect(dispatch.pendingCount()).toBe(1);  // Inflights active

      await p1;
      expect(dispatch.pendingCount()).toBe(0);

      // Test waitForAll (with a registered thunk for async)
      registerTestModule({
        t1: thunk('TEST/WAIT', () => async () => new Promise(r => setTimeout(r, 10)), ['PING'])
      });
      const p2 = dispatch({ type: 'PING' });
      const waitAll = dispatch.waitForAll();
      expect(await waitAll).toHaveSize(1);  // Settled array
    });
  });

  describe('locking', () => {
    it('serializes thunk-dispatched actions via the shared lock (no next() overlap)', async () => {
      const ready1 = deferred<void>();
      const ready2 = deferred<void>();
      const startDispatch = deferred<void>();

      const t1 = thunk(
        'TEST/LOCK_1',
        () => async (dispatch) => {
          ready1.resolve();
          await startDispatch.promise;
          await dispatch({ type: 'FROM_T1' });
        },
        ['PING']
      );

      const t2 = thunk(
        'TEST/LOCK_2',
        () => async (dispatch) => {
          ready2.resolve();
          await startDispatch.promise;
          await dispatch({ type: 'FROM_T2' });
        },
        ['PING']
      );

      registerTestModule({ t1, t2 });

      const firstThunkActionEnteredNext = deferred<string>();
      const allowFirstThunkActionToFinishNext = deferred<void>();
      let blockedFirstThunkAction = false;

      const { dispatch, received, overlaps } = createHarness('concurrent', {
        nextHook: async (action) => {
          if (blockedFirstThunkAction) return;
          if (!action.type.startsWith('FROM_')) return;
          blockedFirstThunkAction = true;
          firstThunkActionEnteredNext.resolve(action.type);
          await allowFirstThunkActionToFinishNext.promise;
        },
      });

      const p = dispatch({ type: 'PING' });

      await Promise.all([ready1.promise, ready2.promise]);
      startDispatch.resolve();

      await firstThunkActionEnteredNext.promise;
      allowFirstThunkActionToFinishNext.resolve();
      await p;

      expect(received.map(a => a.type)).toContain('FROM_T1');
      expect(received.map(a => a.type)).toContain('FROM_T2');
      expect(overlaps).toEqual([]);
    });

    it('serializes inner dispatches in exclusive mode (no deadlock)', async () => {
      const ready = deferred<void>();
      const startInner = deferred<void>();

      const t1 = thunk(
        'TEST/EXCL_LOCK',
        () => async (dispatch) => {
          ready.resolve();
          await startInner.promise;
          await dispatch({ type: 'INNER_1' });
          await dispatch({ type: 'INNER_2' });
        },
        ['PING']
      );

      registerTestModule({ t1 });

      const { dispatch, received, overlaps } = createHarness('exclusive', {
        nextHook: async (action) => {
          if (action.type.startsWith('INNER_')) {
            await new Promise(r => setTimeout(r, 0));  // Simulate async next
          }
        },
      });

      const p = dispatch({ type: 'PING' });
      await ready.promise;
      startInner.resolve();
      await p;

      const inners = received.filter(a => a.type.startsWith('INNER_')).map(a => a.type);
      expect(inners).toEqual(['INNER_1', 'INNER_2']);  // Sequential
      expect(overlaps).toEqual([]);  // No overlaps
    });
  });

  describe('stress', () => {
    it('concurrent mode: runs many matching thunks concurrently (no starvation)', async () => {
      const thunkCount = 25;
      const started = Array.from({ length: thunkCount }, () => deferred<void>());
      const allowFinish = deferred<void>();

      const actions: Record<string, any> = {};
      for (let i = 0; i < thunkCount; i++) {
        const index = i;
        actions[`t${index}`] = thunk(
          `TEST/STRESS_CONC_${index}`,
          () => async () => {
            started[index].resolve();
            await allowFinish.promise;
          },
          ['PING']
        );
      }

      registerTestModule(actions);

      const { dispatch } = createHarness('concurrent');
      const p = dispatch({ type: 'PING' });

      await Promise.all(started.map(s => s.promise));
      allowFinish.resolve();
      await p;
    });

    it('exclusive mode: serializes concurrent dispatch calls (no overlap)', async () => {
      const thunkStarted = deferred<void>();
      const allowThunkFinish = deferred<void>();

      const t1 = thunk(
        'TEST/STRESS_EXCL_SERIAL',
        () => async () => {
          thunkStarted.resolve();
          await allowThunkFinish.promise;
        },
        ['PING']
      );

      registerTestModule({ t1 });

      let pingCount = 0;
      const { dispatch, received, overlaps } = createHarness('exclusive', {
        nextHook: async (action) => {
          if (action.type === 'PING') pingCount++;
        },
      });

      const p1 = dispatch({ type: 'PING' });
      await thunkStarted.promise;

      const p2 = dispatch({ type: 'PING' });
      await new Promise<void>(r => setTimeout(r, 0));
      expect(pingCount).toBe(1);

      allowThunkFinish.resolve();
      await Promise.all([p1, p2]);

      expect(pingCount).toBe(2);
      expect(received.filter(a => a.type === 'PING')).toHaveSize(2);
      expect(overlaps).toEqual([]);
    });

    it('concurrent mode: serializes many thunk-dispatched actions via the shared lock', async () => {
      const thunkCount = 20;
      const ready = Array.from({ length: thunkCount }, () => deferred<void>());
      const startDispatch = deferred<void>();

      const actions: Record<string, any> = {};
      for (let i = 0; i < thunkCount; i++) {
        const index = i;
        actions[`t${index}`] = thunk(
          `TEST/STRESS_LOCK_${index}`,
          () => async (dispatch) => {
            ready[index].resolve();
            await startDispatch.promise;
            await dispatch({ type: `FROM_${index}` });
          },
          ['PING']
        );
      }

      registerTestModule(actions);

      const firstEntered = deferred<string>();
      const allowFirstFinish = deferred<void>();
      let blocked = false;

      const { dispatch, received, overlaps } = createHarness('concurrent', {
        nextHook: async (action) => {
          if (blocked) return;
          if (!action.type.startsWith('FROM_')) return;
          blocked = true;
          firstEntered.resolve(action.type);
          await allowFirstFinish.promise;
        },
      });

      const p = dispatch({ type: 'PING' });
      await Promise.all(ready.map(r => r.promise));
      startDispatch.resolve();

      await firstEntered.promise;
      await new Promise<void>(r => setTimeout(r, 0));
      expect(overlaps).toEqual([]);

      allowFirstFinish.resolve();
      await p;

      for (let i = 0; i < thunkCount; i++) {
        expect(received.map(a => a.type)).toContain(`FROM_${i}`);
      }
      expect(overlaps).toEqual([]);
    });
  });
});
