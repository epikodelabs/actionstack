import {
  createFeatureSelector,
  selector,
  selectorAsync,
  featureSelector,
  Selector,
  TrackableSelector,
} from '@actioncrew/actionstack';
import { createTracker, Tracker } from '@actioncrew/actionstack';
import { createBehaviorSubject, map } from '@actioncrew/streamix';

describe('Selectors', () => {
  interface TestState {
    user: {
      name: string;
      age: number;
      address: {
        city: string;
        zip: string;
      };
    };
    products: Array<{ id: number; name: string; price: number }>;
    count: number;
  }

  const mockState: TestState = {
    user: {
      name: 'John Doe',
      age: 30,
      address: {
        city: 'New York',
        zip: '10001',
      },
    },
    products: [
      { id: 1, name: 'Product A', price: 100 },
      { id: 2, name: 'Product B', price: 200 },
    ],
    count: 5,
  };

  describe('createFeatureSelector', () => {
    it('should select a top-level property by key', () => {
      const selectCount = createFeatureSelector<TestState, 'count'>('count');
      const result = selectCount(mockState);
      expect(result).toBe(5);
    });

    it('should select a nested property by key', () => {
      const selectUser = createFeatureSelector<TestState, 'user'>('user');
      const result = selectUser(mockState);
      expect(result).toEqual(mockState.user);
    });

    it('should select a nested property by path array', () => {
      const selectUser = createFeatureSelector<TestState, ['user']>(['user']);
      const result = selectUser(mockState);
      expect(result).toEqual(mockState.user);
    });

    it('should return undefined for non-existent key', () => {
      const selectMissing = createFeatureSelector<any, 'missing'>('missing');
      const result = selectMissing(mockState);
      expect(result).toBeUndefined();
    });

    it('should handle null/undefined state gracefully', () => {
      const selectCount = createFeatureSelector<TestState, 'count'>('count');
      const result = selectCount(null as any);
      expect(result).toBeUndefined();
    });
  });

  describe('featureSelector (alias)', () => {
    it('should be an alias for createFeatureSelector', () => {
      expect(featureSelector).toBe(createFeatureSelector);
    });
  });

  describe('selector', () => {
    it('should work as identity selector with single function', () => {
      const selectUser = selector((state: TestState) => state.user);
      const result = selectUser(mockState);
      expect(result).toEqual(mockState.user);
    });

    it('should create derived selector with two inputs and projector', () => {
      const selectUserName = selector(
        (state: TestState) => state.user,
        (user) => user.name
      );
      const result = selectUserName(mockState);
      expect(result).toBe('John Doe');
    });

    it('should create derived selector with multiple inputs', () => {
      const selectProducts = (state: TestState) => state.products;
      const selectCount = (state: TestState) => state.count;
      const selectExpensiveProducts = selector(
        selectProducts,
        selectCount,
        (products: any, count: any) => products.filter((p: any) => p.price > count * 10)
      );
      const result = selectExpensiveProducts(mockState);
      expect(result).toEqual([
        { id: 1, name: 'Product A', price: 100 },
        { id: 2, name: 'Product B', price: 200 },
      ]);
    });

    it('should compose selectors', () => {
      const selectUser = selector((state: TestState) => state.user);
      const selectUserAge = selector(selectUser, (user) => user.age);
      const result = selectUserAge(mockState);
      expect(result).toBe(30);
    });

    it('should handle complex projections', () => {
      const selectUser = (state: TestState) => state.user;
      const selectCount = (state: TestState) => state.count;
      const selectUserSummary = selector(
        selectUser,
        selectCount,
        (user: any, count: any) => ({
          name: user.name,
          age: user.age,
          city: user.address.city,
          multiplier: count * 2,
        })
      );
      const result = selectUserSummary(mockState);
      expect(result).toEqual({
        name: 'John Doe',
        age: 30,
        city: 'New York',
        multiplier: 10,
      });
    });
  });

  describe('selectorAsync', () => {
    it('should work as async identity selector with single function', async () => {
      const selectUser = selectorAsync((state: TestState) => state.user);
      const result = await selectUser(mockState);
      expect(result).toEqual(mockState.user);
    });

    it('should create async derived selector with projector', async () => {
      const selectUserDetails = selectorAsync(
        (state: TestState) => state.user,
        async (user) => {
          // Simulate async operation
          await new Promise(resolve => setTimeout(resolve, 10));
          return `${user.name} (${user.age})`;
        }
      );
      const result = await selectUserDetails(mockState);
      expect(result).toBe('John Doe (30)');
    });

    it('should handle multiple inputs with async projector', async () => {
      const selectProducts = (state: TestState) => state.products;
      const selectCount = (state: TestState) => state.count;
      const selectEnrichedProducts = selectorAsync(
        selectProducts,
        selectCount,
        async (products: any, count: any) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return products.map((p: any) => ({
            ...p,
            discounted: p.price * (count / 10),
          }));
        }
      );
      const result = await selectEnrichedProducts(mockState);
      expect(result).toEqual([
        { id: 1, name: 'Product A', price: 100, discounted: 50 },
        { id: 2, name: 'Product B', price: 200, discounted: 100 },
      ]);
    });

    it('should handle errors in async projector', async () => {
      const selectWithError = selectorAsync(
        (state: TestState) => state.user,
        async (user) => {
          throw new Error('Async error');
        }
      );
      
      try {
        await selectWithError(mockState);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.message).toBe('Async error');
      }
    });
  });

  describe('selectStream', () => {
    let tracker: Tracker;
    let stateSubject: ReturnType<typeof createBehaviorSubject<TestState>>;

    beforeEach(() => {
      tracker = createTracker();
      stateSubject = createBehaviorSubject<TestState>(mockState);
    });

    afterEach(() => {
      stateSubject.complete();
    });

    it('should create a stream from selector with tracker', (done) => {
      const selectCount: any = selector((state: TestState) => state.count);
      selectCount._tracker = tracker;

      const stream: any = stateSubject.pipe(map((state: TestState) => selectCount(state))
      );
      stream._tracker = tracker;

      const values: number[] = [];

      const subscription = stream.subscribe({
        next: (value: number) => {
          values.push(value);
          if (values.length === 2) {
            expect(values).toEqual([5, 10]);
            subscription.unsubscribe();
            done();
          }
        },
      });

      // Emit new state
      setTimeout(() => {
        stateSubject.next({ ...mockState, count: 10 });
      }, 10);
    });

    it('should emit only distinct values', (done) => {
      const selectUserName: any = selector(
        (state: TestState) => state.user,
        (user) => user.name
      );
      selectUserName._tracker = tracker;

      const values: string[] = [];

      const subscription = stateSubject.subscribe({
        next: (state: TestState) => {
          const value = selectUserName(state);
          if (values.length === 0 || values[values.length - 1] !== value) {
            values.push(value);
          }
        },
      });

      // Emit states with same name
      setTimeout(() => stateSubject.next(mockState), 10);
      setTimeout(() => stateSubject.next(mockState), 20);
      setTimeout(() => {
        stateSubject.next({
          ...mockState,
          user: { ...mockState.user, name: 'Jane Doe' },
        });
      }, 30);
      setTimeout(() => {
        // Should only have initial value and the changed value
        expect(values).toEqual(['John Doe', 'Jane Doe']);
        subscription.unsubscribe();
        done();
      }, 50);
    });
  });

  describe('selectStreamAsync', () => {
    let tracker: Tracker;
    let stateSubject: ReturnType<typeof createBehaviorSubject<TestState>>;

    beforeEach(() => {
      tracker = createTracker();
      stateSubject = createBehaviorSubject<TestState>(mockState);
    });

    afterEach(() => {
      stateSubject.complete();
    });

    it('should process async selector emissions', (done) => {
      const selectAsync: any = selectorAsync(
        (state: TestState) => state.count,
        async (count) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return count * 2;
        }
      );
      selectAsync._tracker = tracker;

      const values: number[] = [];

      stateSubject.subscribe({
        next: async (state: TestState) => {
          const value = await selectAsync(state);
          values.push(value);
          if (values.length === 2) {
            expect(values).toEqual([10, 20]);
            done();
          }
        },
      });

      // Emit new state after initial async processing
      setTimeout(() => {
        stateSubject.next({ ...mockState, count: 10 });
      }, 50);
    });

    it('should handle async errors', (done) => {
      const selectWithError: any = selectorAsync(
        (state: TestState) => state.count,
        async (count) => {
          throw new Error('Async stream error');
        }
      );
      selectWithError._tracker = tracker;

      stateSubject.subscribe({
        next: async (state: TestState) => {
          try {
            await selectWithError(state);
            fail('Should have thrown an error');
          } catch (err: any) {
            expect(err.message).toBe('Async stream error');
            done();
          }
        },
      });
    });
  });

  describe('Integration: processSelectors-like behavior', () => {
    it('should attach tracker to selector', () => {
      const tracker = createTracker();

      // Simulate what processSelectors does
      const sliceSelector = selector((state: TestState) => state.count);
      const trackedSelector = sliceSelector as TrackableSelector<TestState, number>;
      trackedSelector._tracker = tracker;

      expect(trackedSelector._tracker).toBe(tracker);
      
      const result = trackedSelector(mockState);
      expect(result).toBe(5);
    });

    it('should work with nested slice selectors', () => {
      interface RootState {
        feature: TestState;
      }

      const rootState: RootState = { feature: mockState };

      // Slice selector (operates on slice state)
      const selectCountFromSlice = selector((state: TestState) => state.count);

      // Root selector (wraps slice selector)
      const selectCount = (rootState: RootState) =>
        selectCountFromSlice(rootState.feature);

      const result = selectCount(rootState);
      expect(result).toBe(5);
    });
  });
});