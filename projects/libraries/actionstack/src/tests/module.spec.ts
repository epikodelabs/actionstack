import {
  action,
  createModule,
  registerModule,
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
    expect(dispatchedThunk.type).toBe("feature/run");
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
});
