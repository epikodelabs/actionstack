import {
  selector,
  selectorAsync,
  selectStream,
  selectStreamAsync
} from '@actioncrew/actionstack';
import { createBehaviorSubject } from '@actioncrew/streamix';

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
    let stateSubject: ReturnType<typeof createBehaviorSubject<TestState>>;

    beforeEach(() => {
      stateSubject = createBehaviorSubject<TestState>(mockState);
    });

    afterEach(() => {
      stateSubject.complete();
    });

    it('should emit derived values when state changes', (done) => {
      const selectCount = selector((state: TestState) => state.count);
      const stream = selectStream(selectCount, stateSubject);

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

      setTimeout(() => {
        stateSubject.next({ ...mockState, count: 10 });
      }, 10);
    });

    it('should react to nested selector values', (done) => {
      const selectUserName = selector(
        (state: TestState) => state.user,
        (user) => user.name
      );
      const stream = selectStream(selectUserName, stateSubject);

      const values: string[] = [];
      const subscription = stream.subscribe({
        next: (value: string) => {
          values.push(value);
          if (values.length === 3) {
            expect(values).toEqual(['John Doe', 'John Doe', 'Jane Doe']);
            subscription.unsubscribe();
            done();
          }
        },
      });

      setTimeout(() => stateSubject.next(mockState), 10);
      setTimeout(
        () =>
          stateSubject.next({
            ...mockState,
            user: { ...mockState.user, name: 'Jane Doe' },
          }),
        20
      );
    });
  });

  describe('selectStreamAsync', () => {
    let stateSubject: ReturnType<typeof createBehaviorSubject<TestState>>;

    beforeEach(() => {
      stateSubject = createBehaviorSubject<TestState>(mockState);
    });

    afterEach(() => {
      stateSubject.complete();
    });

    it('should emit derived values from async selectors', (done) => {
      const selectAsync = selectorAsync(
        (state: TestState) => state.count,
        async (count) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return count * 2;
        }
      );
      const stream = selectStreamAsync(selectAsync, stateSubject);

      const values: number[] = [];
      const subscription = stream.subscribe({
        next: (value: number) => {
          values.push(value);
          if (values.length === 2) {
            expect(values).toEqual([10, 20]);
            subscription.unsubscribe();
            done();
          }
        },
        error: (err) => {
          subscription.unsubscribe();
          fail(err);
        },
      });

      setTimeout(() => {
        stateSubject.next({ ...mockState, count: 10 });
      }, 50);
    });

    it('should propagate async errors', (done) => {
      const selectWithError = selectorAsync(
        (state: TestState) => state.count,
        async () => {
          throw new Error('Async stream error');
        }
      );
      const stream = selectStreamAsync(selectWithError, stateSubject);

      stream.subscribe({
        next: () => fail('Should not emit next'),
        error: (err: any) => {
          expect(err.message).toBe('Async stream error');
          done();
        },
      });
    });
  });

  describe('Integration: processSelectors-like behavior', () => {
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
