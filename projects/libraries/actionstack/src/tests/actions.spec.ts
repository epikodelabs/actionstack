import {
  bindActionCreator,
  bindActionCreators,
  createAction,
  createActionRegistry,
  createThunk,
  getActionHandlers,
  getRegisteredThunks,
  registerActionHandlers,
  registerThunks,
  unregisterActionHandlers,
  unregisterThunks,
} from "@epikodelabs/actionstack";

describe("actions", () => {
  beforeEach(() => {
    spyOn(console, "warn").and.stub();
  });

  describe("createAction", () => {
    it("creates a no-payload action creator with match/toString", () => {
      const ac = createAction("TEST/NO_PAYLOAD");

      expect(String(ac)).toBe("TEST/NO_PAYLOAD");
      expect(ac.match({ type: "TEST/NO_PAYLOAD" } as any)).toBeTrue();
      expect(ac.match({ type: "OTHER" } as any)).toBeFalse();

      expect(ac()).toEqual({ type: "TEST/NO_PAYLOAD" });
    });

    it("creates a payload action creator when handler expects payload", () => {
      const ac = createAction(
        "TEST/WITH_PAYLOAD",
        (_state: any, payload: number) => payload
      );

      expect(ac(123)).toEqual({ type: "TEST/WITH_PAYLOAD", payload: 123 });
    });

    it("extracts meta and error fields from object payload", () => {
      const ac = createAction(
        "TEST/META_ERROR",
        (
          _state: any,
          payload: { value: number; meta: { traceId: string }; error: boolean }
        ) => payload
      );

      const payload = { value: 1, meta: { traceId: "t1" }, error: true } as const;

      expect(ac(payload as any)).toEqual({
        type: "TEST/META_ERROR",
        payload,
        meta: { traceId: "t1" },
        error: true,
      });
    });

    it("supports a payloadCreator override", () => {
      const ac = createAction(
        "TEST/PAYLOAD_CREATOR",
        () => 0,
        (a: number, b: number) => a + b
      );

      expect(ac(2, 3)).toEqual({ type: "TEST/PAYLOAD_CREATOR", payload: 5 });
    });
  });

  describe("createThunk", () => {
    it("wraps errors with a warning and rethrows", async () => {
      const t = createThunk("TEST/THUNK_FAIL", () => async () => {
        throw new Error("boom");
      });

      try {
        await t()(async () => {}, async () => ({}), {});
        fail("Expected thunk to throw");
      } catch (err: any) {
        expect(err.message).toBe("boom");
      }

      expect((console.warn as any).calls.any()).toBeTrue();
      const msg = String((console.warn as any).calls.mostRecent().args[0]);
      expect(msg).toContain('Error in thunk action "TEST/THUNK_FAIL": boom.');
    });
  });

  describe("bind", () => {
    it("binds a single action creator", () => {
      const dispatch = jasmine.createSpy("dispatch");
      const ac = createAction(
        "TEST/BOUND",
        (_state: any, payload: number) => payload
      );
      const bound = bindActionCreator(ac as any, dispatch);

      bound(7);
      expect(dispatch).toHaveBeenCalledWith({ type: "TEST/BOUND", payload: 7 });
    });

    it("bindActionCreators supports a function input", () => {
      const dispatch = jasmine.createSpy("dispatch");
      const ac = createAction(
        "TEST/FN_BOUND",
        (_state: any, payload: number) => payload
      );

      const bound = bindActionCreators(ac as any, dispatch);
      bound(9);
      expect(dispatch).toHaveBeenCalledWith({ type: "TEST/FN_BOUND", payload: 9 });
    });

    it("binds an object of action creators and warns on invalid input", () => {
      const dispatch = jasmine.createSpy("dispatch");
      const creators = {
        a: createAction("TEST/A", (_state: any, payload: number) => payload),
        b: createAction("TEST/B", (_state: any, payload: number) => payload),
      };

      const bound = bindActionCreators(creators as any, dispatch);
      bound.a(1);
      bound.b(2);

      expect(dispatch.calls.allArgs()).toEqual([
        [{ type: "TEST/A", payload: 1 }],
        [{ type: "TEST/B", payload: 2 }],
      ]);

      (console.warn as any).calls.reset();
      const bad = bindActionCreators(null as any, dispatch);
      expect(bad).toBeUndefined();
      expect((console.warn as any).calls.any()).toBeTrue();
    });
  });

  describe("registries", () => {
    const modulesToCleanup: any[] = [];
    let registry = createActionRegistry();

    beforeEach(() => {
      registry = createActionRegistry();
    });

    afterEach(() => {
      while (modulesToCleanup.length) {
        const m = modulesToCleanup.pop();
        unregisterActionHandlers(m, registry);
        unregisterThunks(m, registry);
      }
    });

    it("registers/unregisters action handlers", () => {
      const handler = jasmine.createSpy("handler");
      const a = createAction("TEST/REG_ACTION", handler as any);
      const mod = { actions: { a } } as any;
      modulesToCleanup.push(mod);

      registerActionHandlers(mod, registry);
      expect(getActionHandlers("TEST/REG_ACTION", registry)).toBe(handler);

      unregisterActionHandlers(mod, registry);
      expect(getActionHandlers("TEST/REG_ACTION", registry)).toBeUndefined();
    });

    it("warns when registering a duplicate action handler", () => {
      const a1 = createAction("TEST/DUP_ACTION", (() => 0) as any);
      const a2 = createAction("TEST/DUP_ACTION", (() => 1) as any);
      const mod1 = { actions: { a1 } } as any;
      const mod2 = { actions: { a2 } } as any;
      modulesToCleanup.push(mod1, mod2);

      registerActionHandlers(mod1, registry);
      registerActionHandlers(mod2, registry);

      expect((console.warn as any).calls.any()).toBeTrue();
    });

    it("registers/unregisters thunks and warns on duplicate thunk type", () => {
      const t1 = createThunk("TEST/REG_THUNK", () => async () => {});
      const t2 = createThunk("TEST/REG_THUNK", () => async () => {});

      const mod1 = { actions: { t1 } } as any;
      const mod2 = { actions: { t2 } } as any;
      modulesToCleanup.push(mod1, mod2);

      registerThunks(mod1, registry);
      expect(getRegisteredThunks(registry).some((x: any) => x.type === "TEST/REG_THUNK")).toBeTrue();

      (console.warn as any).calls.reset();
      registerThunks(mod2, registry);
      expect((console.warn as any).calls.any()).toBeTrue();

      unregisterThunks(mod1, registry);
      expect(getRegisteredThunks(registry).some((x: any) => x.type === "TEST/REG_THUNK")).toBeFalse();
    });
  });
});

