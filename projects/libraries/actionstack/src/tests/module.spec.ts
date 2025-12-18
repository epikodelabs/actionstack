import {
  action,
  createModule,
  createStore,
  registerModule,
  selector,
  thunk,
  unregisterModule,
} from "@actioncrew/actionstack";

describe("module", () => {
  it("namespaces action creator types and dispatches via module.actions", () => {
    const dispatch = jasmine.createSpy("dispatch");
    const store: any = {
      dispatch,
      select: () => {
        throw new Error("select not used");
      },
      unloadModule: async () => {},
    };

    const mod = createModule({
      slice: "counter",
      initialState: { value: 0 },
      actions: {
        set: action("SET", (_state: any, payload: number) => ({ value: payload })),
      },
    });

    mod.configure(store);

    const returned = (mod.actions as any).set(5);
    expect(returned).toEqual({ type: "counter/SET", payload: 5 });
    expect(dispatch).toHaveBeenCalledWith({ type: "counter/SET", payload: 5 });
    expect(String((mod.actions as any).set)).toBe("counter/SET");
  });

  it("namespaces thunk triggers and thunk type", () => {
    const dispatch = jasmine.createSpy("dispatch");
    const store: any = {
      dispatch,
      select: () => {
        throw new Error("select not used");
      },
      unloadModule: async () => {},
    };

    const run = thunk(
      "IGNORED_ORIGINAL_TYPE",
      () => async () => {},
      ["PING", "other/ALREADY_NAMESPACED"]
    );

    const mod = createModule({
      slice: "feature",
      initialState: {},
      actions: { run },
    });

    mod.configure(store);

    expect((mod.actions as any).run.triggers).toEqual([
      "feature/PING",
      "other/ALREADY_NAMESPACED",
    ]);

    const dispatchedThunk = (mod.actions as any).run();
    expect(dispatchedThunk.type).toBe("feature/IGNORED_ORIGINAL_TYPE");
    expect(dispatch).toHaveBeenCalledWith(dispatchedThunk);
  });

  it("destroy() unloads by default and disables actions until reconfigured", () => {
    const dispatch = jasmine.createSpy("dispatch");
    const unloadModule = jasmine.createSpy("unloadModule").and.resolveTo();

    const store: any = { dispatch, select: () => ({}), unloadModule };
    const mod = createModule({
      slice: "tmp",
      initialState: { value: 0 },
      actions: { set: action("SET", (s: any, v: number) => ({ value: v })) },
    });

    mod.configure(store);
    mod.destroy();

    expect(unloadModule).toHaveBeenCalledWith(mod, true);
    expect(() => (mod.actions as any).set(1)).toThrowError(/cannot be dispatched before configuration/i);
  });

  it("destroy(false) does not unload from store", () => {
    const unloadModule = jasmine.createSpy("unloadModule").and.resolveTo();
    const store: any = { dispatch: () => {}, select: () => ({}), unloadModule };

    const mod = createModule({
      slice: "tmp2",
      initialState: {},
      actions: {},
    });
    mod.configure(store);
    mod.destroy(false);

    expect(unloadModule).not.toHaveBeenCalled();
  });

  it("registerModule chooses loadModule vs populate", () => {
    const loadModule = jasmine.createSpy("loadModule").and.resolveTo();
    const populate = jasmine.createSpy("populate").and.resolveTo();
    const store: any = { loadModule, populate };

    const m1 = createModule({ slice: "m1", initialState: {}, actions: {} });
    const m2 = createModule({ slice: "m2", initialState: {}, actions: {} });

    registerModule(store, m1);
    expect(loadModule).toHaveBeenCalledWith(m1);
    expect(populate).not.toHaveBeenCalled();

    loadModule.calls.reset();
    registerModule(store, m1, m2);
    expect(populate).toHaveBeenCalledWith(m1, m2);
  });

  it("unregisterModule supports clearState as first or last arg", () => {
    const unloadModule = jasmine.createSpy("unloadModule").and.resolveTo();
    const store: any = { unloadModule };

    const m1 = createModule({ slice: "u1", initialState: {}, actions: {} });
    const m2 = createModule({ slice: "u2", initialState: {}, actions: {} });

    unregisterModule(store, m1, m2);
    expect(unloadModule.calls.allArgs()).toEqual([
      [m1, true],
      [m2, true],
    ]);

    unloadModule.calls.reset();
    unregisterModule(store, false, m1, m2);
    expect(unloadModule.calls.allArgs()).toEqual([
      [m1, false],
      [m2, false],
    ]);

    unloadModule.calls.reset();
    unregisterModule(store, m1, m2, false);
    expect(unloadModule.calls.allArgs()).toEqual([
      [m1, false],
      [m2, false],
    ]);
  });

  describe("data", () => {
    function nextValue<T>(stream: any): Promise<T> {
      return new Promise<T>((resolve) => {
        const sub = stream.subscribe({
          next: (v: T) => {
            sub.unsubscribe();
            resolve(v);
          },
        });
      });
    }

    it("emits selected values and completes when module is unloaded", async () => {
      const store = createStore<any>();

      const mod = createModule({
        slice: "mdata",
        initialState: { count: 0 },
        actions: {
          inc: action("INC", (state: any) => ({ count: (state?.count ?? 0) + 1 })),
        },
        selectors: {
          count: selector((s: any) => s.count),
        },
      });

      await store.loadModule(mod);
      await store.dispatch({ type: "TEST/FLUSH" });

      const stream = mod.data$.count();

      expect(await nextValue<number>(stream)).toBe(0);
      await store.dispatch({ type: "mdata/INC" });
      expect(await nextValue<number>(stream)).toBe(1);

      let completed = false;
      const sub = stream.subscribe({
        next: () => {},
        complete: () => {
          completed = true;
        },
      });

      await store.unloadModule(mod, true);
      await new Promise<void>((r) => setTimeout(r, 0));

      expect(completed).toBeTrue();
      sub.unsubscribe();
    });

    it("selects nested slices for data streams", async () => {
      const store = createStore<any>();

      const mod = createModule({
        slice: "nest/child",
        initialState: { value: 1 },
        actions: {
          set: action("SET", (_s: any, v: number) => ({ value: v })),
        },
        selectors: {
          value: selector((s: any) => s.value),
        },
      });

      await store.loadModule(mod);
      await store.dispatch({ type: "TEST/FLUSH" });

      const stream = mod.data$.value();
      expect(await nextValue<number>(stream)).toBe(1);

      await store.dispatch({ type: "nest/child/SET", payload: 5 });
      expect(await nextValue<number>(stream)).toBe(5);
    });
  });

  describe("errors", () => {
    it("throws when a selector is not a function", () => {
      const store: any = {
        dispatch: () => {},
        select: () => {
          throw new Error("select not used");
        },
        unloadModule: async () => {},
      };

      const mod = createModule({
        slice: "badsel",
        initialState: {},
        actions: {},
        selectors: {
          bad: 123 as any,
        },
      });

      expect(() => mod.configure(store)).toThrowError(/must be a function/i);
    });

    it("throws from data$ streams when store becomes unavailable", async () => {
      const store: any = {
        dispatch: () => {},
        select: () => {
          throw new Error("select not used");
        },
        unloadModule: async () => {},
      };

      const mod = createModule({
        slice: "nostore",
        initialState: { count: 0 },
        actions: {},
        selectors: {
          count: selector((s: any) => s.count),
        },
      });

      mod.configure(store);
      mod.destroy(false);

      const stream = mod.data$.count();
      const error = await new Promise<unknown>((resolve) => {
        stream.subscribe({ error: (e: unknown) => resolve(e) });
      });
      expect(String(error)).toMatch(/store not available/i);
    });

    it("registerModule returns early when no modules are provided", () => {
      const loadModule = jasmine.createSpy("loadModule");
      const populate = jasmine.createSpy("populate");
      const store: any = { loadModule, populate };

      const result = registerModule(store);
      expect(result).toEqual([]);
      expect(loadModule).not.toHaveBeenCalled();
      expect(populate).not.toHaveBeenCalled();
    });

    it("unregisterModule returns early when no modules are provided", () => {
      const unloadModule = jasmine.createSpy("unloadModule");
      const store: any = { unloadModule };

      const result = unregisterModule(store);
      expect(result).toEqual([]);
      expect(unloadModule).not.toHaveBeenCalled();
    });
  });

  it("namespaces thunk triggers while preserving predicate triggers", () => {
    const dispatch = jasmine.createSpy("dispatch");
    const store: any = {
      dispatch,
      select: () => {
        throw new Error("select not used");
      },
      unloadModule: async () => {},
    };

    const pred = (a: any) => a?.type === "PING";

    const run = thunk(
      "IGNORED_ORIGINAL_TYPE",
      () => async () => {},
      ["PONG", pred]
    );

    const mod = createModule({
      slice: "feature2",
      initialState: {},
      actions: { run },
    });

    mod.configure(store);

    expect((mod.actions as any).run.triggers).toEqual(["feature2/PONG", pred]);
  });

  it("selectSlice returns undefined when root state is missing", () => {
    const store: any = {
      dispatch: () => {},
      select: () => {
        throw new Error("select not used");
      },
      unloadModule: async () => {},
    };

    const mod = createModule({
      slice: "missing/path",
      initialState: {},
      actions: {},
      selectors: {
        v: selector((s: any) => s?.v),
      },
    });

    mod.configure(store);
    expect((mod.selectors as any).v(undefined)).toBeUndefined();
  });
});
