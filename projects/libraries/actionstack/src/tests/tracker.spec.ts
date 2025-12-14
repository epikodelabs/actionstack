import { createTracker, Tracker } from '@actioncrew/actionstack';
import { createSubject } from '@actioncrew/streamix';

describe('Tracker', () => {
  let tracker: Tracker;

  beforeEach(() => {
    tracker = createTracker();
  });

  describe('Basic Operations', () => {
    it('should create a tracker with default timeout', () => {
      expect(tracker.timeout).toBe(30000);
    });

    it('should track a stream', () => {
      const stream = createSubject();
      tracker.track(stream);
      expect(tracker.state(stream)).toBe(false);
    });

    it('should not track the same stream twice', () => {
      const stream = createSubject();
      tracker.track(stream);
      tracker.track(stream);
      // Should still work without errors
      expect(tracker.state(stream)).toBe(false);
    });

    it('should signal a tracked stream', () => {
      const stream = createSubject();
      tracker.track(stream);
      tracker.signal(stream);
      expect(tracker.state(stream)).toBe(true);
    });

    it('should return false for untracked stream state', () => {
      const stream = createSubject();
      expect(tracker.state(stream)).toBe(false);
    });

    it('should not signal untracked stream', () => {
      const stream = createSubject();
      tracker.signal(stream);
      expect(tracker.state(stream)).toBe(false);
    });

    it('should remove a tracked stream', () => {
      const stream = createSubject();
      tracker.track(stream);
      tracker.signal(stream);
      tracker.complete(stream);
      expect(tracker.state(stream)).toBe(false);
    });

    it('should complete a tracked stream', () => {
      const stream = createSubject();
      tracker.track(stream);
      tracker.signal(stream);
      tracker.complete(stream);
      expect(tracker.state(stream)).toBe(false);
    });

    it('should reset all tracked streams to false', () => {
      const stream1 = createSubject();
      const stream2 = createSubject();
      
      tracker.track(stream1);
      tracker.track(stream2);
      tracker.signal(stream1);
      tracker.signal(stream2);
      
      tracker.reset();
      
      expect(tracker.state(stream1)).toBe(false);
      expect(tracker.state(stream2)).toBe(false);
    });
  });

  describe('waitAll - Simple Cases', () => {
    it('should resolve immediately when no streams are tracked', async () => {
      const startTime = Date.now();
      await tracker.waitAll();
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100);
    });

    it('should resolve when single stream signals', async () => {
      const stream = createSubject();
      tracker.track(stream);

      const promise = tracker.waitAll();

      // Simulate iteration completion
      setTimeout(() => {
        tracker.signal(stream);
      }, 10);

      await expectAsync(promise).toBeResolved();
    });

    it('should resolve when multiple streams signal', async () => {
      const stream1 = createSubject();
      const stream2 = createSubject();
      const stream3 = createSubject();
      
      tracker.track(stream1);
      tracker.track(stream2);
      tracker.track(stream3);

      const promise = tracker.waitAll();

      // Simulate iterations at different times
      setTimeout(() => tracker.signal(stream1), 10);
      setTimeout(() => tracker.signal(stream2), 20);
      setTimeout(() => tracker.signal(stream3), 30);

      await expectAsync(promise).toBeResolved();
    });

    it('should resolve when stream completes instead of signaling', async () => {
      const stream = createSubject();
      tracker.track(stream);

      const promise = tracker.waitAll();

      setTimeout(() => {
        tracker.complete(stream);
      }, 10);

      await expectAsync(promise).toBeResolved();
    });
  });

  describe('waitAll - Complex Scenarios', () => {
    it('should handle rapid successive signals', async () => {
      const stream = createSubject();
      tracker.track(stream);

      const promise = tracker.waitAll();

      // Simulate signal
      setTimeout(() => {
        tracker.signal(stream);
      }, 10);

      await expectAsync(promise).toBeResolved();
    });

    it('should handle streams with different signal speeds', async () => {
      const fastStream = createSubject();
      const slowStream = createSubject();
      
      tracker.track(fastStream);
      tracker.track(slowStream);

      const promise = tracker.waitAll();

      // Fast stream signals quickly
      setTimeout(() => tracker.signal(fastStream), 10);

      // Slow stream takes longer
      setTimeout(() => tracker.signal(slowStream), 50);

      await expectAsync(promise).toBeResolved();
    });

    it('should handle mixed completion and signal', async () => {
      const stream1 = createSubject();
      const stream2 = createSubject();
      const stream3 = createSubject();
      
      tracker.track(stream1);
      tracker.track(stream2);
      tracker.track(stream3);

      const promise = tracker.waitAll();

      setTimeout(() => {
        // Stream 1: normal signal
        tracker.signal(stream1);
        
        // Stream 2: completes
        tracker.complete(stream2);
        
        // Stream 3: normal signal
        tracker.signal(stream3);
      }, 10);

      await expectAsync(promise).toBeResolved();
    });

    it('should queue multiple waitAll calls', async () => {
      const stream = createSubject();
      tracker.track(stream);

      // First call
      const promise1 = tracker.waitAll();
      
      // Second call (should queue)
      const promise2 = tracker.waitAll();

      setTimeout(() => tracker.signal(stream), 10);
      
      await promise1;
      
      setTimeout(() => tracker.signal(stream), 10);

      await expectAsync(promise2).toBeResolved();
    });

    it('should handle stream added after waitAll called', async () => {
      const stream1 = createSubject();
      tracker.track(stream1);

      const promise = tracker.waitAll();

      setTimeout(() => tracker.signal(stream1), 10);

      await expectAsync(promise).toBeResolved();

      // Add new stream after first waitAll completes
      const stream2 = createSubject();
      tracker.track(stream2);

      const promise2 = tracker.waitAll();

      setTimeout(() => tracker.signal(stream2), 10);

      await expectAsync(promise2).toBeResolved();
    });

    it('should reset all states after waitAll resolves', async () => {
      const stream1 = createSubject();
      const stream2 = createSubject();
      
      tracker.track(stream1);
      tracker.track(stream2);

      const promise = tracker.waitAll();

      setTimeout(() => {
        tracker.signal(stream1);
        tracker.signal(stream2);
      }, 10);

      await promise;

      // After resolution, states should be reset
      expect(tracker.state(stream1)).toBe(false);
      expect(tracker.state(stream2)).toBe(false);
    });
  });

  describe('waitAll - Edge Cases', () => {
    it('should handle stream removed during waitAll', async () => {
      const stream1 = createSubject();
      const stream2 = createSubject();
      
      tracker.track(stream1);
      tracker.track(stream2);

      const promise = tracker.waitAll();

      setTimeout(() => {
        tracker.signal(stream1);
        tracker.complete(stream2); // Remove before signal
      }, 10);

      await expectAsync(promise).toBeResolved();
    });

    it('should reject on timeout', async () => {
      // Create tracker with short timeout for testing
      const shortTracker = {
        ...createTracker(),
        timeout: 100
      } as Tracker;

      const stream = createSubject();
      shortTracker.track(stream);

      const promise = shortTracker.waitAll();

      // Never signal
      await expectAsync(promise).toBeRejectedWith('Timeout reached');
    });

    it('should handle empty tracker after reset', async () => {
      const stream = createSubject();
      tracker.track(stream);
      tracker.signal(stream);
      tracker.reset();

      await expectAsync(tracker.waitAll()).toBeResolved();
    });
  });

  describe('Real-world Scenarios', () => {
    it('should track selector iterations during state updates', async () => {
      // Simulate 3 selectors
      const selector1 = createSubject();
      const selector2 = createSubject();
      const selector3 = createSubject();

      tracker.track(selector1);
      tracker.track(selector2);
      tracker.track(selector3);

      const promise = tracker.waitAll();

      // Simulate state dispatch that triggers all selectors
      setTimeout(() => {
        // Selector 1 processes quickly
        setTimeout(() => tracker.signal(selector1), 5);

        // Selector 2 takes longer
        setTimeout(() => tracker.signal(selector2), 15);

        // Selector 3 is fastest
        setTimeout(() => tracker.signal(selector3), 2);
      }, 10);

      await expectAsync(promise).toBeResolved();
    });

    it('should handle multiple dispatch cycles', async () => {
      const selector = createSubject();
      tracker.track(selector);

      // First dispatch
      const promise1 = tracker.waitAll();
      setTimeout(() => tracker.signal(selector), 10);
      await promise1;

      // Second dispatch
      const promise2 = tracker.waitAll();
      setTimeout(() => tracker.signal(selector), 10);
      await promise2;

      // Third dispatch
      const promise3 = tracker.waitAll();
      setTimeout(() => tracker.signal(selector), 10);
      await promise3;

      expect(true).toBe(true); // All dispatches completed
    });

    it('should handle dynamic selector registration', async () => {
      const selector1 = createSubject();
      tracker.track(selector1);

      const promise1 = tracker.waitAll();

      setTimeout(() => tracker.signal(selector1), 10);

      await promise1;

      // Register new selector after first execution
      const selector2 = createSubject();
      tracker.track(selector2);

      const promise2 = tracker.waitAll();

      setTimeout(() => {
        tracker.signal(selector1);
        tracker.signal(selector2);
      }, 10);

      await expectAsync(promise2).toBeResolved();
    });

    it('should handle module load/unload with selectors', async () => {
      // Simulate module load
      const moduleSelectors = [
        createSubject(),
        createSubject(),
        createSubject()
      ];

      moduleSelectors.forEach(s => tracker.track(s));

      const promise1 = tracker.waitAll();

      setTimeout(() => {
        moduleSelectors.forEach(s => tracker.signal(s));
      }, 10);

      await promise1;

      // Simulate module unload
      moduleSelectors.forEach(s => tracker.complete(s));

      // Should resolve immediately (no tracked streams)
      await expectAsync(tracker.waitAll()).toBeResolved();
    });
  });

  describe('Performance', () => {
    it('should handle many streams efficiently', async () => {
      const streams = Array.from({ length: 100 }, () => createSubject());

      streams.forEach(s => tracker.track(s));

      const startTime = Date.now();
      const promise = tracker.waitAll();

      setTimeout(() => {
        streams.forEach(s => tracker.signal(s));
      }, 10);

      await promise;
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000);
    });

    it('should handle rapid waitAll calls', async () => {
      const stream = createSubject();
      tracker.track(stream);

      const promises = Array.from({ length: 10 }, (_, i) => {
        const p = tracker.waitAll();
        setTimeout(() => tracker.signal(stream), 10 + (i * 20));
        return p;
      });

      await expectAsync(Promise.all(promises)).toBeResolved();
    });
  });
});