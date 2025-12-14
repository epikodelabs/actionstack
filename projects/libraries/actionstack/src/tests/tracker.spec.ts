import { createTracker, selector, Tracker } from '@actioncrew/actionstack';
import { createSubject, map } from '@actioncrew/streamix';

interface TestState {
  user: {
    name: string;
    age: number;
  };
  count: number;
}

const mockState: TestState = {
  user: {
    name: 'John Doe',
    age: 30
  },
  count: 5
};

describe('Tracker Integration with Selectors', () => {
  let tracker: Tracker;

  beforeEach(() => {
    tracker = createTracker();
  });

  describe('Basic Selector Tracking', () => {
    it('should track selector execution and signal completion', async () => {
      // Create a selector
      const selectUser = selector((state: TestState) => state.user);
      
      // Attach tracker to selector
      (selectUser as any)._tracker = tracker;
      
      // Create a subject to simulate state stream
      const stateSubject = createSubject<TestState>();
      
      // Track the selector stream
      const selectorStream = stateSubject.pipe(map(selectUser));
      tracker.track(selectorStream);
      
      const waitPromise = tracker.waitAll();
      
      // Emit state which triggers selector
      setTimeout(() => {
        stateSubject.next(mockState);
        tracker.signal(selectorStream);
      }, 10);
      
      await expectAsync(waitPromise).toBeResolved();
      expect(tracker.state(selectorStream)).toBe(false); // Reset after completion
    });

    it('should track multiple selector executions', async () => {
      const selectUser = selector((state: TestState) => state.user);
      const selectCount = selector((state: TestState) => state.count);
      const selectUserAge = selector(
        selectUser,
        (user) => user.age
      );
      
      // Attach tracker to all selectors
      (selectUser as any)._tracker = tracker;
      (selectCount as any)._tracker = tracker;
      (selectUserAge as any)._tracker = tracker;
      
      const stateSubject = createSubject<TestState>();
      
      // Create streams for each selector
      const userStream = stateSubject.pipe(map(selectUser));
      const countStream = stateSubject.pipe(map(selectCount));
      const ageStream = stateSubject.pipe(map(selectUserAge));
      
      // Track all streams
      tracker.track(userStream);
      tracker.track(countStream);
      tracker.track(ageStream);
      
      const waitPromise = tracker.waitAll();
      
      // Simulate state update that triggers all selectors
      setTimeout(() => {
        stateSubject.next(mockState);
        
        // Signal completion in order
        tracker.signal(userStream);
        tracker.signal(countStream);
        tracker.signal(ageStream);
      }, 10);
      
      await expectAsync(waitPromise).toBeResolved();
      
      // All should be reset
      expect(tracker.state(userStream)).toBe(false);
      expect(tracker.state(countStream)).toBe(false);
      expect(tracker.state(ageStream)).toBe(false);
    });
  });

  describe('Selector Execution Order', () => {
    it('should wait for all selectors to complete even with different execution times', async () => {
      const fastSelector = selector((state: TestState) => {
        // Fast computation
        return state.count;
      });
      
      const slowSelector = selector((state: TestState) => {
        // Simulate slow computation
        const start = Date.now();
        while (Date.now() - start < 20) {}
        return state.user.name;
      });
      
      (fastSelector as any)._tracker = tracker;
      (slowSelector as any)._tracker = tracker;
      
      const stateSubject = createSubject<TestState>();
      const fastStream = stateSubject.pipe(map(fastSelector));
      const slowStream = stateSubject.pipe(map(slowSelector));
      
      tracker.track(fastStream);
      tracker.track(slowStream);
      
      const waitPromise = tracker.waitAll();
      const executionStart = Date.now();
      
      setTimeout(() => {
        stateSubject.next(mockState);
        
        // Fast selector completes first
        setTimeout(() => tracker.signal(fastStream), 5);
        
        // Slow selector completes later
        setTimeout(() => tracker.signal(slowStream), 25);
      }, 10);
      
      await expectAsync(waitPromise).toBeResolved();
      
      const executionTime = Date.now() - executionStart;
      expect(executionTime).toBeGreaterThan(30); // Should wait for slow selector
    });
  });

  describe('State Updates', () => {
    it('should handle multiple state updates in sequence', async () => {
      const selectCount = selector((state: TestState) => state.count);
      (selectCount as any)._tracker = tracker;
      
      const stateSubject = createSubject<TestState>();
      const countStream = stateSubject.pipe(map(selectCount));
      tracker.track(countStream);
      
      // First update
      let update1Completed = false;
      tracker.waitAll().then(() => {
        update1Completed = true;
      });
      
      setTimeout(() => {
        stateSubject.next({ ...mockState, count: 10 });
        tracker.signal(countStream);
      }, 10);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(update1Completed).toBe(true);
      
      // Second update
      let update2Completed = false;
      tracker.waitAll().then(() => {
        update2Completed = true;
      });
      
      setTimeout(() => {
        stateSubject.next({ ...mockState, count: 20 });
        tracker.signal(countStream);
      }, 10);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(update2Completed).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should still signal completion when selector throws error', async () => {
      const errorSelector = selector((state: TestState) => {
        throw new Error('Selector error');
      });
      
      (errorSelector as any)._tracker = tracker;
      
      const stateSubject = createSubject<TestState>();
      const errorStream = stateSubject.pipe(map(errorSelector));
      tracker.track(errorStream);
      
      const waitPromise = tracker.waitAll();
      
      setTimeout(() => {
        try {
          stateSubject.next(mockState);
        } catch (error) {
          // Error caught
        }
        tracker.signal(errorStream);
      }, 10);
      
      await expectAsync(waitPromise).toBeResolved();
    });
  });

  describe('Complex Selector Chains', () => {
    it('should track execution of derived selectors', async () => {
      const selectUser = selector((state: TestState) => state.user);
      const selectUserSummary = selector(
        selectUser,
        (user) => `${user.name} (${user.age})`
      );
      
      (selectUser as any)._tracker = tracker;
      (selectUserSummary as any)._tracker = tracker;
      
      const stateSubject = createSubject<TestState>();
      
      // Only track the final selector stream
      const summaryStream = stateSubject.pipe(map(selectUserSummary));
      tracker.track(summaryStream);
      
      const waitPromise = tracker.waitAll();
      
      setTimeout(() => {
        stateSubject.next(mockState);
        tracker.signal(summaryStream);
      }, 10);
      
      await expectAsync(waitPromise).toBeResolved();
    });
  });

  describe('Async Selectors', () => {
    it('should track async selector execution', async () => {
      const selectUserAsync = async (state: TestState) => {
        await new Promise(resolve => setTimeout(resolve, 20));
        return state.user;
      };
      
      // Simulate attaching tracker to async selector
      const asyncSelectorWithTracker = Object.assign(
        async (state: TestState) => selectUserAsync(state),
        { _tracker: tracker }
      );
      
      const stateSubject = createSubject<TestState>();
      const asyncStream = stateSubject.pipe(map(async (state) => {
        const result = await asyncSelectorWithTracker(state);
        return result;
      }));
      
      tracker.track(asyncStream);
      
      const waitPromise = tracker.waitAll();
      
      setTimeout(async () => {
        stateSubject.next(mockState);
        // Signal after async operation completes
        setTimeout(() => tracker.signal(asyncStream), 25);
      }, 10);
      
      await expectAsync(waitPromise).toBeResolved();
    });
  });

  describe('Performance with Many Selectors', () => {
    it('should handle tracking many concurrent selectors', async () => {
      // Create multiple selectors
      const selectors = Array.from({ length: 50 }, (_, i) => 
        selector((state: TestState) => ({ index: i, count: state.count + i }))
      );
      
      // Attach tracker to all selectors
      selectors.forEach(sel => (sel as any)._tracker = tracker);
      
      const stateSubject = createSubject<TestState>();
      const streams = selectors.map(sel => stateSubject.pipe(map(sel)));
      
      // Track all streams
      streams.forEach(stream => tracker.track(stream));
      
      const waitPromise = tracker.waitAll();
      const startTime = Date.now();
      
      setTimeout(() => {
        stateSubject.next(mockState);
        
        // Signal all completions
        streams.forEach((stream, i) => {
          setTimeout(() => tracker.signal(stream), i * 2); // Stagger signals
        });
      }, 10);
      
      await expectAsync(waitPromise).toBeResolved();
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000); // Should complete reasonably fast
    });
  });
});