import {
  action,
  createModule,
  createStore,
  populateStore,
  registerModule,
  selector,
  thunk,
  unregisterModule,
} from "@epikodelabs/actionstack";

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

  it("populateStore delegates to store.populate across multiple modules", () => {
    const populate = jasmine.createSpy("populate").and.resolveTo();
    const store: any = { populate };

    const m1 = createModule({ slice: "p1", initialState: {}, actions: {} });
    const m2 = createModule({ slice: "p2", initialState: {}, actions: {} });

    const result = populateStore(store, m1, m2);

    expect(populate).toHaveBeenCalledWith(m1, m2);
    expect(result).toEqual([m1, m2]);
  });

  describe("data", () => {
    function nextValue<T>(stream: any): Promise<T> {
      return new Promise<T>((resolve) => {
        let sub: any;
        sub = stream.subscribe({
          next: (v: T) => {
            queueMicrotask(() => {
              sub.unsubscribe();
            });
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

      expect(await nextValue<number>(mod.data$.count())).toBe(0);
      await store.dispatch({ type: "mdata/INC" });
      expect(await nextValue<number>(mod.data$.count())).toBe(1);

      const stream = mod.data$.count();

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

    it("exposes data$ selector factories before the module is configured", async () => {
      const store = createStore<any>();

      const mod = createModule({
        slice: "preconfigured",
        initialState: { count: 2 },
        actions: {
          inc: action("INC", (state: any) => ({ count: (state?.count ?? 0) + 1 })),
        },
        selectors: {
          count: selector((s: any) => s.count),
        },
      });

      const stream = mod.data$.count();
      const firstValue = nextValue<number>(stream);

      await store.loadModule(mod);
      await store.dispatch({ type: "TEST/FLUSH" });

      expect(await firstValue).toBe(2);
      await store.dispatch({ type: "preconfigured/INC" });
      expect(await nextValue<number>(stream)).toBe(3);
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

      expect(await nextValue<number>(mod.data$.value())).toBe(1);

      await store.dispatch({ type: "nest/child/SET", payload: 5 });
      expect(await nextValue<number>(mod.data$.value())).toBe(5);
    });

    it("exposes module.selectors as plain root selectors", async () => {
      const store = createStore<any>();

      const mod = createModule({
        slice: "selectors/plain",
        initialState: { value: 3 },
        selectors: {
          value: selector((s: any) => s.value),
        },
        actions: {},
      });

      await store.loadModule(mod);
      await store.dispatch({ type: "TEST/FLUSH" });

      expect((mod.selectors as any).value({ selectors: { plain: { value: 3 } } })).toBe(3);
    });

  });

  describe("errors", () => {
    it("throws when a selector is not a function", () => {
      expect(() =>
        createModule({
          slice: "badsel",
          initialState: {},
          actions: {},
          selectors: {
            bad: 123 as any,
          },
        })
      ).toThrowError(/must be a function/i);
    });

    it("throws when a selector is declared as a zero-arg factory", () => {
      expect(() =>
        createModule({
          slice: "legacy-selector",
          initialState: {},
          actions: {},
          selectors: {
            bad: (() => (_state: any) => "x") as any,
          },
        })
      ).toThrowError(/selector factories are not supported/i);
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

