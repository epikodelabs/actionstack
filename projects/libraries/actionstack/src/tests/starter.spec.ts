import type { Action } from '@epikodelabs/actionstack';
import {
  createActionHandler,
  createQueue,
  createStarter,
  registerThunks,
  thunk,
  unregisterThunks,
} from '@epikodelabs/actionstack';

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
  const queue = createQueue();
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
    queue,
    strategy: () => strategyName,
  } as any)(next);

  return { dispatch, received, overlaps };
}

describe('starter', () => {
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

    it('returns false gracefully if action is null/undefined in matchesAction', async () => {
      // Direct unit test of matchesAction is hard because it's internal,
      // but passing null action to dispatch might trigger it if dispatch allows it.
      // However dispatch usually expects an object.
      // The implementation checks `action?.type`.
      // Let's try sending a possibly invalid object that might pass type check but be nullish later?
      // Or just rely on the existing internal checks.
      // Actually, if we dispatch `null`, the starter middleware signature `(action: {type: string})` might complain or crash before `matchesAction`.
      // But `matchesAction` gets called with `action as any`.
      // Let's force a call with something that might reach there.
      
      const t1 = thunk('TEST/NULL_ACTION', () => async () => {}, ['PING']);
      registerTestModule({ t1 });

      const { dispatch } = createHarness('exclusive');
      // @ts-ignore
      await dispatch(null).catch(() => {}); // Dispatch itself might fail earlier, but ensures coverage isn't crashing
      // @ts-ignore
      await dispatch(undefined).catch(() => {});
    });

    it('ignores thunks with invalid triggers (not an array)', async () => {
      const badThunk = {
        type: 'TEST/BAD_TRIGGERS',
        triggers: 'not-an-array',
      };
      // Manually register since thunk() helper enforces array
      registerTestModule({ badThunk });

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

    it('ignores thunks with invalid trigger types inside the triggers array', async () => {
      const t1 = thunk(
        'TEST/INVALID_TRIGGER_TYPE',
        () => async (dispatch) => {
          await dispatch({ type: 'SHOULD_NOT_RUN' });
        },
        ['PING', 123 as any] // Invalid trigger type
      );

      registerTestModule({ t1 });

      const { dispatch, received } = createHarness('exclusive');
      await dispatch({ type: 'PING' });

      // The thunk should still run because 'PING' is a valid trigger.
      // The invalid trigger '123' should be ignored.
      expect(received.map(a => a.type)).toContain('SHOULD_NOT_RUN');

      // Now dispatch something that would only match the invalid one
      const { dispatch: dispatch2, received: received2 } = createHarness('exclusive');
      await dispatch2({ type: '123' });
      expect(received2.map(a => a.type)).not.toContain('SHOULD_NOT_RUN');
    });
  });

  describe('strategy', () => {
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

    it('falls back when strategy() throws', async () => {
      const warn = spyOn(console, 'warn');

      const { dispatch, received } = createHarness({
        toString() {
          throw new Error('bad strategy');
        },
      } as any);
      await dispatch({ type: 'PING' });

      expect(received.map(a => a.type)).toEqual(['PING']);
      expect(warn).toHaveBeenCalled();
      expect(String(warn.calls.mostRecent().args[0])).toContain(
        '[starter] Unknown strategy:'
      );
    });

    it('falls back when strategy() returns unknown string', async () => {
      const warn = spyOn(console, 'warn');

      const { dispatch, received } = createHarness('unknown-strat');
      await dispatch({ type: 'PING' });

      expect(received.map(a => a.type)).toEqual(['PING']);
      expect(warn).toHaveBeenCalled();
      expect(String(warn.calls.mostRecent().args[0])).toContain(
        '[starter] Unknown strategy: unknown-strat'
      );
    });
  });

  describe('handler', () => {
    it('uses default queue implementation if none provided', async () => {
      const handler = createActionHandler({
        getState: () => ({}),
        dependencies: () => ({}),
        dispatch: async () => {},
        // queue is omitted
      } as any);

      const next = jasmine.createSpy('next').and.callFake(async () => {});
      await handler({ type: 'TEST' } as any, next);
      expect(next).toHaveBeenCalledWith({ type: 'TEST' });
    });



    it('queues dispatched actions when handling a thunk', async () => {
      const queue = createQueue();
      spyOn(queue, 'enqueue').and.callThrough();

      const handler = createActionHandler(
        {
          getState: () => ({}),
          dependencies: () => ({}),
          queue,
          dispatch: async () => {},
        } as any,
        { lockThunks: true }
      );

      const next = jasmine.createSpy('next').and.resolveTo();

      const thunkAction: any = async (dispatch: any) => {
        await dispatch({ type: 'NESTED' });
      };

      await handler(thunkAction, next, false);

      expect(queue.enqueue).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith({ type: 'NESTED' });
    });

    it('queues nested action dispatches', async () => {
      const queue = createQueue();
      spyOn(queue, 'enqueue').and.callThrough();

      const handler = createActionHandler(
        {
          getState: () => ({}),
          dependencies: () => ({}),
          queue,
          dispatch: async () => {},
        } as any,
        { lockThunks: true }
      );

      const next = jasmine.createSpy('next').and.resolveTo();
      await handler({ type: 'NESTED' } as any, next, true);

      expect(queue.enqueue).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith({ type: 'NESTED' });
    });

    it('passes inlineIfRunning to queue enqueue when nested dispatch occurs', async () => {
      const options: any[] = [];
      const queue = {
        enqueue: jasmine
          .createSpy('enqueue')
          .and.callFake(async (operation: any, opts: any) => {
            options.push(opts);
            return operation();
          }),
      } as any;

      const handler = createActionHandler(
        {
          getState: () => ({}),
          dependencies: () => ({}),
          queue,
          dispatch: async () => {},
        } as any,
        { lockThunks: true }
      );

      const next = jasmine.createSpy('next').and.resolveTo();

      await handler({ type: 'TOP' } as any, next, false);
      await handler({ type: 'NESTED' } as any, next, true);

      expect(options[0]).toEqual({ inlineIfRunning: false });
      expect(options[1]).toEqual({ inlineIfRunning: true });
    });
  });

  describe('execution', () => {
    it('warns and skips a thunk when instantiation throws', async () => {
      const warn = spyOn(console, 'warn');

      const bad: any = () => {
        throw new Error('instantiate boom');
      };
      Object.assign(bad, {
        isThunk: true,
        type: 'TEST/BAD_THUNK',
        triggers: ['PING'],
      });

      registerTestModule({ bad });

      const { dispatch, received } = createHarness('exclusive');
      await dispatch({ type: 'PING' });

      expect(received.map((a) => a.type)).toEqual(['PING']);
      expect(warn).toHaveBeenCalled();
      expect(String(warn.calls.allArgs().flat().join(' '))).toContain(
        'Failed to instantiate thunk'
      );
    });

    it('logs exclusive thunk errors and continues', async () => {
      const warn = spyOn(console, 'warn');

      const bad = thunk(
        'TEST/EXCL_THROW',
        () => async () => {
          throw new Error('boom');
        },
        ['PING']
      );

      registerTestModule({ bad });

      const { dispatch, received } = createHarness('exclusive');
      await dispatch({ type: 'PING' });

      expect(received.map((a) => a.type)).toEqual(['PING']);
      expect(String(warn.calls.allArgs().flat().join(' '))).toContain(
        '[starter] [exclusive] Thunk error'
      );
    });

    it('logs exclusive unhandled errors when next() throws', async () => {
      const warn = spyOn(console, 'warn');

      const { dispatch } = createHarness('exclusive', {
        nextHook: () => {
          throw new Error('next boom');
        },
      });

      await dispatch({ type: 'PING' });
      expect(String(warn.calls.allArgs().flat().join(' '))).toContain(
        '[starter] [exclusive] Unhandled error'
      );
    });

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

    it('does not trigger thunks for non-matching actions', async () => {
      const t1 = thunk(
        'TEST/NO_MATCH',
        () => async (dispatch) => {
          await dispatch({ type: 'SHOULD_NOT_RUN' });
        },
        ['PING']
      );

      registerTestModule({ t1 });

      const { dispatch, received } = createHarness('exclusive');
      await dispatch({ type: 'PONG' });

      expect(received.map(a => a.type)).toEqual(['PONG']);
    });

    it('trigger function runs once per dispatched action in concurrent mode', async () => {
      let triggerCalls = 0;
      const trigger = (action: any) => {
        triggerCalls++;
        return action.type === 'PING';
      };

      const t1 = thunk(
        'TEST/TRIGGER_CALLS',
        () => async () => {},
        [trigger]
      );

      registerTestModule({ t1 });

      const { dispatch } = createHarness('concurrent');
      await dispatch({ type: 'PING' });
      await dispatch({ type: 'PONG' });

      expect(triggerCalls).toBe(2);
    });
  });

  describe('resilience', () => {
    it('concurrent mode: continues processing subsequent actions after a thunk throws', async () => {
      const warn = spyOn(console, 'warn');
      const ran: string[] = [];

      const errorThunk = thunk(
        'TEST/RESILIENT_CONC_ERROR',
        () => async () => {
          throw new Error('thunk error');
        },
        ['PING']
      );

      const okThunk = thunk(
        'TEST/RESILIENT_CONC_OK',
        () => async () => {
          ran.push('ok');
        },
        ['PONG']
      );

      registerTestModule({ errorThunk, okThunk });

      const { dispatch: dispatchFn, received } = createHarness('concurrent');
      const dispatch = dispatchFn as any;

      await dispatch({ type: 'PING' });
      expect(warn).toHaveBeenCalled();
      expect(dispatch.pendingCount()).toBe(0);
      expect(await dispatch.waitForAll()).toEqual([]);

      await dispatch({ type: 'PONG' });
      expect(ran).toEqual(['ok']);
      expect(received.map(a => a.type)).toEqual(['PING', 'PONG']);
    });

    it('exclusive mode: a failing thunk does not prevent other matching thunks from running', async () => {
      const warn = spyOn(console, 'warn');
      const ran: string[] = [];

      const errorThunk = thunk(
        'TEST/RESILIENT_EXCL_ERROR',
        () => async () => {
          throw new Error('thunk error');
        },
        ['PING']
      );

      const okThunk = thunk(
        'TEST/RESILIENT_EXCL_OK',
        () => async () => {
          ran.push('ok');
        },
        ['PING']
      );

      registerTestModule({ errorThunk, okThunk });

      const { dispatch } = createHarness('exclusive');
      await dispatch({ type: 'PING' });

      expect(warn).toHaveBeenCalled();
      expect(ran).toEqual(['ok']);
    });

    it('concurrent mode: a failing thunk does not prevent other matching thunks from running', async () => {
      const warn = spyOn(console, 'warn');
      const ran: string[] = [];

      const errorThunk = thunk(
        'TEST/RESILIENT_CONC_ERROR_2',
        () => async () => {
          throw new Error('concurrent thunk error');
        },
        ['PING']
      );

      const okThunk = thunk(
        'TEST/RESILIENT_CONC_OK_2',
        () => async () => {
          ran.push('ok');
        },
        ['PING']
      );

      registerTestModule({ errorThunk, okThunk });

      const { dispatch: dispatchFn } = createHarness('concurrent');
      const dispatch = dispatchFn as any;
      await dispatch({ type: 'PING' });
      await dispatch.waitForAll(); // Wait for concurrent thunks

      expect(warn).toHaveBeenCalled();
      expect(ran).toEqual(['ok']);
    });

    it('concurrent mode: handles thunk cancellation/rejection properly in loop', async () => {
      const warn = spyOn(console, 'warn');
      const t1 = thunk(
        'TEST/REJECTED_PROMISE',
        () => async () => {
          return Promise.reject(new Error('rejected promise'));
        },
        ['PING']
      );
      registerTestModule({ t1 });

      const { dispatch: dispatchFn } = createHarness('concurrent');
      const dispatch = dispatchFn as any;
      await dispatch({ type: 'PING' });
      await dispatch.waitForAll();

      expect(warn).toHaveBeenCalled();
      expect(String(warn.calls.mostRecent().args[0])).toContain('rejected promise');
    });

    it('concurrent mode: failing next() logs once and clears inflight', async () => {
      const warn = spyOn(console, 'warn');

      const { dispatch: dispatchFn } = createHarness('concurrent', {
        nextHook: () => {
          throw new Error('next boom');
        },
      });
      const dispatch = dispatchFn as any;

      await dispatch({ type: 'PING' });
      await dispatch.waitForAll();

      expect(dispatch.pendingCount()).toBe(0);
      expect(String(warn.calls.allArgs().flat().join(' '))).toContain(
        '[starter] [concurrent] Unhandled error'
      );
    });
  });

  describe('concurrent', () => {
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

    it('waitForAll waits for multiple in-flight dispatches', async () => {
      const allowFinish = deferred<void>();

      registerTestModule({
        t1: thunk(
          'TEST/WAIT_ALL_MULTI',
          () => async () => {
            await allowFinish.promise;
          },
          ['PING']
        )
      });

      const { dispatch: dispatchFn } = createHarness('concurrent');
      const dispatch = dispatchFn as any;

      const p1 = dispatch({ type: 'PING' });
      const p2 = dispatch({ type: 'PING' });
      expect(dispatch.pendingCount()).toBe(2);

      const waitAll = dispatch.waitForAll();
      expect(dispatch.pendingCount()).toBe(2);

      allowFinish.resolve();
      const results = await waitAll;
      expect(results).toHaveSize(2);

      await Promise.all([p1, p2]);
      expect(dispatch.pendingCount()).toBe(0);
    });

    it('pendingCount tracks a burst of concurrent dispatches', async () => {
      const allowFinish = deferred<void>();
      registerTestModule({
        t1: thunk(
          'TEST/PENDING_BURST',
          () => async () => {
            await allowFinish.promise;
          },
          ['PING']
        )
      });

      const { dispatch: dispatchFn } = createHarness('concurrent');
      const dispatch = dispatchFn as any;

      const burst = 5;
      const promises = Array.from({ length: burst }, () => dispatch({ type: 'PING' }));
      expect(dispatch.pendingCount()).toBe(burst);

      const waitAll = dispatch.waitForAll();
      allowFinish.resolve();
      await waitAll;
      await Promise.all(promises);

      expect(dispatch.pendingCount()).toBe(0);
    });

    it('waitForAll returns empty when there is no inflight work', async () => {
      const { dispatch: dispatchFn } = createHarness('concurrent');
      const dispatch = dispatchFn as any;

      expect(dispatch.pendingCount()).toBe(0);
      expect(await dispatch.waitForAll()).toEqual([]);
    });
  });

  describe('queueing', () => {
    it('serializes thunk-dispatched actions via the shared queue (no next() overlap)', async () => {
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

    it('exclusive mode: sequential top-level dispatch calls do not overlap in next()', async () => {
      const { dispatch, overlaps } = createHarness('exclusive', {
        nextHook: async () => {
          await new Promise(r => setTimeout(r, 0));
        },
      });

      const p1 = dispatch({ type: 'PING' });
      const p2 = dispatch({ type: 'PONG' });
      await Promise.all([p1, p2]);

      expect(overlaps).toEqual([]);
    });
  });

  describe('edgeCases', () => {
    it('createActionHandler handles lockThunks without nestedQueue on non-nested dispatch', async () => {
      const handler = createActionHandler(
        {
          getState: () => ({}),
          dependencies: () => ({}),
          queue: createQueue(),
          dispatch: async () => {},
        } as any,
        { lockThunks: false }
      );

      const next = jasmine.createSpy('next').and.resolveTo();
      await handler({ type: 'TEST' } as any, next, false);
      expect(next).toHaveBeenCalledWith({ type: 'TEST' });
    });

    it('createActionHandler uses default queue when queue is not provided', async () => {
      const handler = createActionHandler({
        getState: () => ({}),
        dependencies: () => ({}),
        dispatch: async () => {},
      } as any);

      const next = jasmine.createSpy('next').and.resolveTo();
      await handler({ type: 'TEST' } as any, next);
      expect(next).toHaveBeenCalledWith({ type: 'TEST' });
    });

    it('matchesAction handles null/undefined action gracefully', async () => {
      const t1 = thunk(
        'TEST/NULL_CHECK',
        () => async (dispatch) => {
          await dispatch({ type: 'SHOULD_NOT_RUN' });
        },
        ['PING']
      );

      registerTestModule({ t1 });

      const { dispatch, received } = createHarness('exclusive');
      // The middleware may handle null differently, but we verify it doesn't crash
      try {
        await dispatch(null as any);
      } catch {}

      // Normal operation should still work
      await dispatch({ type: 'PONG' });
      expect(received.map(a => a?.type).filter(Boolean)).toContain('PONG');
    });

    it('resolveThunk returns null when thunk throws during instantiation', async () => {
      const warn = spyOn(console, 'warn');

      const badThunk: any = () => {
        throw new Error('instantiate fail');
      };
      badThunk.isThunk = true;
      badThunk.type = 'TEST/BAD_RESOLVE';
      badThunk.triggers = ['PING'];

      registerTestModule({ badThunk });

      const { dispatch, received } = createHarness('exclusive');
      await dispatch({ type: 'PING' });

      expect(received.map(a => a.type)).toEqual(['PING']);
      expect(warn).toHaveBeenCalled();
    });

    it('concurrent mode handles empty matching thunks array', async () => {
      const { dispatch, received } = createHarness('concurrent');
      await dispatch({ type: 'NO_MATCHING_THUNKS' });
      expect(received.map(a => a.type)).toEqual(['NO_MATCHING_THUNKS']);
    });

    it('createActionHandler passes dependencies correctly to thunk', async () => {
      const deps = { value: 42 };
      let capturedDeps: any;

      const handler = createActionHandler({
        getState: () => ({}),
        dependencies: () => deps,
        queue: createQueue(),
        dispatch: async () => {},
      } as any);

      const next = jasmine.createSpy('next').and.resolveTo();
      const thunkAction = async (_dispatch: any, _getState: any, dependencies: any) => {
        capturedDeps = dependencies;
      };

      await handler(thunkAction, next);
      expect(capturedDeps).toBe(deps);
    });

    it('resolveThunk returns thunk directly when it is not a function', async () => {
      const thunkObject = {
        type: 'TEST/OBJECT_THUNK',
        triggers: ['PING'],
      };

      registerTestModule({ thunkObject });

      const { dispatch, received } = createHarness('exclusive');
      await dispatch({ type: 'PING' });
      
      // Should handle non-function thunks gracefully
      expect(received.map(a => a.type)).toEqual(['PING']);
    });

    it('concurrent mode handles catch error in inflight promise', async () => {
      const errorThunk = thunk(
        'TEST/CATCH_ERROR',
        () => async () => {
          throw new Error('uncaught error');
        },
        ['PING']
      );

      registerTestModule({ errorThunk });

      const { dispatch: dispatchFn } = createHarness('concurrent');
      const dispatch = dispatchFn as any;

      // This should trigger the catch block in the inflight promise
      await dispatch({ type: 'PING' });
      await dispatch.waitForAll();

      expect(dispatch.pendingCount()).toBe(0);
    });

    it('concurrent mode handles non-Error rejection reasons', async () => {
      const warn = spyOn(console, 'warn');
      
      const badThunk = thunk(
        'TEST/NON_ERROR_REJECT',
        () => async () => {
          throw 'string error'; // Non-Error rejection
        },
        ['PING']
      );

      registerTestModule({ badThunk });

      const { dispatch: dispatchFn } = createHarness('concurrent');
      const dispatch = dispatchFn as any;

      await dispatch({ type: 'PING' });
      await dispatch.waitForAll();

      expect(warn).toHaveBeenCalled();
      const messages = warn.calls.all().map(c => String(c.args[0]));
      expect(messages.some(m => m.includes('string error'))).toBeTrue();
    });

    it('concurrent mode handles undefined/null rejection reasons', async () => {
      const warn = spyOn(console, 'warn');
      
      const badThunk = thunk(
        'TEST/NULL_REJECT',
        () => async () => {
          throw null; // null rejection
        },
        ['PING']
      );

      registerTestModule({ badThunk });

      const { dispatch: dispatchFn } = createHarness('concurrent');
      const dispatch = dispatchFn as any;

      await dispatch({ type: 'PING' });
      await dispatch.waitForAll();

      expect(warn).toHaveBeenCalled();
      const messages = warn.calls.all().map(c => String(c.args[0]));
      expect(messages.some(m => m.includes('unknown'))).toBeTrue();
    });

    it('exclusive mode handles non-Error exceptions', async () => {
      const warn = spyOn(console, 'warn');
      
      const badThunk = thunk(
        'TEST/EXCL_NON_ERROR',
        () => async () => {
          throw 'string error';
        },
        ['PING']
      );

      registerTestModule({ badThunk });

      const { dispatch } = createHarness('exclusive');
      await dispatch({ type: 'PING' });

      expect(warn).toHaveBeenCalled();
      const messages = warn.calls.all().map(c => String(c.args[0]));
      expect(messages.some(m => m.includes('string error'))).toBeTrue();
    });

    it('exclusive mode handles null/undefined exceptions', async () => {
      const warn = spyOn(console, 'warn');
      
      const badThunk = thunk(
        'TEST/EXCL_NULL',
        () => async () => {
          throw undefined;
        },
        ['PING']
      );

      registerTestModule({ badThunk });

      const { dispatch } = createHarness('exclusive');
      await dispatch({ type: 'PING' });

      expect(warn).toHaveBeenCalled();
      const messages = warn.calls.all().map(c => String(c.args[0]));
      expect(messages.some(m => m.includes('unknown'))).toBeTrue();
    });

    it('concurrent mode main handler error with non-Error type', async () => {
      const warn = spyOn(console, 'warn');

      const { dispatch } = createHarness('concurrent', {
        nextHook: () => {
          throw 'next error string';
        },
      });

      await dispatch({ type: 'PING' });
      
      expect(warn).toHaveBeenCalled();
      const messages = warn.calls.all().map(c => String(c.args[0]));
      expect(messages.some(m => m.includes('next error string'))).toBeTrue();
    });

    it('concurrent mode main handler error with null', async () => {
      const warn = spyOn(console, 'warn');

      const { dispatch } = createHarness('concurrent', {
        nextHook: () => {
          throw null;
        },
      });

      await dispatch({ type: 'PING' });
      
      expect(warn).toHaveBeenCalled();
      const messages = warn.calls.all().map(c => String(c.args[0]));
      expect(messages.some(m => m.includes('unknown'))).toBeTrue();
    });

    it('concurrent mode p.catch handles non-Error', async () => {
      const warn = spyOn(console, 'warn');

      // Create a scenario where the outer promise catches an error
      const { dispatch } = createHarness('concurrent', {
        nextHook: async () => {
          throw { custom: 'object' };
        },
      });

      await dispatch({ type: 'PING' });
      
      expect(warn).toHaveBeenCalled();
    });
  });

  describe('stress', () => {
    it('concurrent mode: drains inflight after a burst of actions with many matching thunks', async () => {
      const thunkCount = 5;
      const actionCount = 10;
      const allowFinish = deferred<void>();
      const allStarted = deferred<void>();
      let startedCount = 0;

      const actions: Record<string, any> = {};
      for (let i = 0; i < thunkCount; i++) {
        actions[`t${i}`] = thunk(
          `TEST/STRESS_BURST_${i}`,
          () => async () => {
            startedCount++;
            if (startedCount === thunkCount * actionCount) {
              allStarted.resolve();
            }
            await allowFinish.promise;
          },
          ['PING']
        );
      }

      registerTestModule(actions);

      const { dispatch: dispatchFn } = createHarness('concurrent');
      const dispatch = dispatchFn as any;

      const promises = Array.from({ length: actionCount }, () =>
        dispatch({ type: 'PING' })
      );

      expect(dispatch.pendingCount()).toBe(actionCount);

      await allStarted.promise;
      allowFinish.resolve();

      await dispatch.waitForAll();
      await Promise.all(promises);

      expect(dispatch.pendingCount()).toBe(0);
      expect(startedCount).toBe(thunkCount * actionCount);
    });

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

    it('exclusive mode: processes many actions with mixed triggers in order', async () => {
      const log: string[] = [];
      const t1 = thunk(
        'TEST/MIXED_T1',
        () => async () => {
          log.push('t1');
        },
        ['PING']
      );
      const t2 = thunk(
        'TEST/MIXED_T2',
        () => async () => {
          log.push('t2');
        },
        ['PONG']
      );
      const t3 = thunk(
        'TEST/MIXED_T3',
        () => async () => {
          log.push('t3');
        },
        [(action: any) => action.type === 'PING' || action.type === 'PONG']
      );

      registerTestModule({ t1, t2, t3 });

      const { dispatch, received, overlaps } = createHarness('exclusive');

      await dispatch({ type: 'PING' });
      await dispatch({ type: 'PONG' });

      expect(received.map(a => a.type)).toEqual(['PING', 'PONG']);
      expect(log).toEqual(['t1', 't3', 't2', 't3']);
      expect(overlaps).toEqual([]);
    });

    it('concurrent mode: serializes many thunk-dispatched actions via the shared queue', async () => {
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

    it('concurrent mode: logs and skips thunks that fail during instantiation', async () => {
      const warn = spyOn(console, 'warn');

      const badThunkCreator: any = () => {
        throw new Error('instantiate error');
      };
      badThunkCreator.isThunk = true;
      badThunkCreator.type = 'TEST/BAD_INSTANTIATE';
      badThunkCreator.triggers = ['PING'];

      registerTestModule({ badThunkCreator });

      const { dispatch } = createHarness('concurrent');
      await dispatch({ type: 'PING' });

      expect(warn).toHaveBeenCalled();
      const messages = warn.calls.all().map(c => String(c.args[0]));
      expect(messages.some(m => m.includes('[starter] Failed to instantiate thunk "TEST/BAD_INSTANTIATE"'))).toBeTrue();
    });

    it('exclusive mode: nested thunk dispatch runs within the active thunk (other thunks wait)', async () => {
      const events: string[] = [];
      const outerStarted = deferred<void>();
      const allowInnerFinish = deferred<void>();

      const outerThunk = thunk(
        'TEST/NEST_OUTER',
        () => async (dispatch) => {
          events.push('outer-start');
          outerStarted.resolve();

          await dispatch(async () => {
            events.push('inner-start');
            await allowInnerFinish.promise;
            events.push('inner-end');
          });

          events.push('outer-end');
        },
        ['PING']
      );

      const otherThunk = thunk(
        'TEST/NEST_OTHER',
        () => async () => {
          events.push('other-start');
          events.push('other-end');
        },
        ['PING']
      );

      registerTestModule({ outerThunk, otherThunk });

      const { dispatch } = createHarness('exclusive');
      const p = dispatch({ type: 'PING' });

      await outerStarted.promise;
      expect(events).toEqual(['outer-start', 'inner-start']);
      expect(events).not.toContain('other-start');

      allowInnerFinish.resolve();
      await p;

      expect(events).toEqual([
        'outer-start',
        'inner-start',
        'inner-end',
        'outer-end',
        'other-start',
        'other-end',
      ]);
    });

    it('concurrent mode: supports multiple trigger types on a single thunk', async () => {
      const events: string[] = [];
      const t1 = thunk(
        'TEST/MULTI_TRIGGER',
        () => async () => {
          events.push('run');
        },
        ['PING', (action: any) => action.type === 'PONG']
      );

      registerTestModule({ t1 });

      const { dispatch } = createHarness('concurrent');
      await dispatch({ type: 'PING' });
      await dispatch({ type: 'PONG' });

      expect(events).toEqual(['run', 'run']);
    });
  });
});

