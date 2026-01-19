import { createLogger, logger } from "@epikodelabs/actionstack/tools";

describe("logger", () => {
  beforeEach(() => {
    spyOn(console, "group").and.stub();
    spyOn(console, "groupCollapsed").and.stub();
    spyOn(console, "groupEnd").and.stub();
    spyOn(console, "log").and.stub();
  });

  it("has a stable signature property", () => {
    expect((logger as any).signature).toBe("6.q.w.c.i.m.9.n.j.y");
  });

  it("logs around next(action)", async () => {
    let state = { count: 0 };
    const api = { getState: () => state } as any;
    const next = async (_action: any) => {
      state = { count: state.count + 1 };
    };

    await (logger as any)(api)(next)({ type: "TEST/LOG" });

    expect(console.group).toHaveBeenCalled();
    expect(console.log).toHaveBeenCalled();
    expect(console.groupEnd).toHaveBeenCalled();
  });

  it("rethrows errors from next(action) while still logging", async () => {
    const api = { getState: () => ({}) } as any;
    const next = async () => {
      throw new Error("boom");
    };

    await expectAsync((logger as any)(api)(next)({ type: "TEST/ERR" })).toBeRejectedWithError("boom");
    expect(console.group).toHaveBeenCalled();
    expect(console.groupEnd).toHaveBeenCalled();
  });
});

describe("createLogger", () => {
  const makeLogger = () => ({
    group: jasmine.createSpy("group"),
    groupCollapsed: jasmine.createSpy("groupCollapsed"),
    groupEnd: jasmine.createSpy("groupEnd"),
    log: jasmine.createSpy("log"),
    warn: jasmine.createSpy("warn"),
    info: jasmine.createSpy("info"),
    error: jasmine.createSpy("error"),
  });

  it("skips logging when logger option is 'undefined'", async () => {
    const mw = createLogger({ logger: "undefined" } as any);
    const next = jasmine.createSpy("next").and.resolveTo("OK");

    const out = await (mw as any)({ getState: () => ({}) })(next)({ type: "X" });

    expect(out).toBe("OK");
    expect(next).toHaveBeenCalledWith({ type: "X" });
  });

  it("returns early when predicate returns false", async () => {
    const custom = makeLogger();
    const mw = createLogger({
      logger: custom,
      predicate: () => false,
    } as any);

    const next = jasmine.createSpy("next").and.resolveTo("OK");

    const out = await (mw as any)({ getState: () => ({}) })(next)({ type: "X" });

    expect(out).toBe("OK");
    expect(next).toHaveBeenCalled();
    expect(custom.group).not.toHaveBeenCalled();
    expect(custom.groupCollapsed).not.toHaveBeenCalled();
  });

  it("supports collapsed=true and uses groupCollapsed", async () => {
    const custom = makeLogger();
    const mw = createLogger({ logger: custom, collapsed: true } as any);
    const next = jasmine.createSpy("next").and.resolveTo(undefined);

    await (mw as any)({ getState: () => ({}) })(next)({ type: "TEST/COLLAPSE" });

    expect(custom.groupCollapsed).toHaveBeenCalled();
    expect(custom.groupEnd).toHaveBeenCalled();
  });

  it("supports collapsed as a function", async () => {
    const custom = makeLogger();
    const mw = createLogger({
      logger: custom,
      collapsed: () => false,
    } as any);

    const next = jasmine.createSpy("next").and.resolveTo(undefined);
    await (mw as any)({ getState: () => ({}) })(next)({ type: "TEST/COLLAPSE_FN" });

    expect(custom.group).toHaveBeenCalled();
    expect(custom.groupCollapsed).not.toHaveBeenCalled();
  });

  it("uses level as an object of functions/strings", async () => {
    const custom = makeLogger();
    const mw = createLogger({
      logger: custom,
      level: {
        prevState: () => "log",
        action: "warn",
        nextState: "info",
        error: "error",
      },
    } as any);

    const api = { getState: () => ({ count: 0 }) } as any;
    const next = jasmine.createSpy("next").and.resolveTo(undefined);

    await (mw as any)(api)(next)({ type: "TEST/LEVEL" });

    expect(custom.log).toHaveBeenCalled();
    expect(custom.warn).toHaveBeenCalled();
    expect(custom.info).toHaveBeenCalled();
  });

  it("uses level as a function", async () => {
    const custom = makeLogger();
    const mw = createLogger({
      logger: custom,
      level: () => "warn",
    } as any);

    const api = { getState: () => ({}) } as any;
    const next = jasmine.createSpy("next").and.resolveTo(undefined);

    await (mw as any)(api)(next)({ type: "TEST/FN_LEVEL" });
    expect(custom.warn).toHaveBeenCalled();
  });

  it("rethrows when logErrors=false and next throws", async () => {
    const custom = makeLogger();
    const mw = createLogger({ logger: custom, logErrors: false } as any);

    const api = { getState: () => ({}) } as any;
    const next = async () => {
      throw new Error("boom");
    };

    await expectAsync((mw as any)(api)(next)({ type: "TEST/NO_LOG_ERRORS" })).toBeRejectedWithError("boom");
  });

  it("falls back to logger.log when group() throws, and tolerates groupEnd() throwing", async () => {
    const custom = makeLogger();
    (custom.group as any).and.callFake(() => {
      throw new Error("group boom");
    });
    (custom.groupEnd as any).and.callFake(() => {
      throw new Error("groupEnd boom");
    });

    const mw = createLogger({ logger: custom, collapsed: false } as any);
    const next = jasmine.createSpy("next").and.resolveTo(undefined);

    await (mw as any)({ getState: () => ({}) })(next)({ type: "TEST/GROUP_THROW" });

    expect(custom.log).toHaveBeenCalled();
  });

  it("respects custom transformers and level callbacks when logging", async () => {
    const custom = makeLogger();

    const transformedState = { snapshot: 5 };
    const stateTransformer = jasmine
      .createSpy("stateTransformer")
      .and.returnValue(transformedState);

    const transformedAction = { type: "TEST/TRANSFORM:X" };
    const actionTransformer = jasmine
      .createSpy("actionTransformer")
      .and.returnValue(transformedAction);

    const prevStateLevel = jasmine
      .createSpy("prevStateLevel")
      .and.returnValue("log");

    const actionLevel = jasmine
      .createSpy("actionLevel")
      .and.returnValue("log");

    const mw = createLogger({
      logger: custom,
      stateTransformer,
      actionTransformer,
      level: {
        prevState: prevStateLevel,
        action: actionLevel,
      },
      duration: false,
      timestamp: false,
    } as any);

    const api = { getState: () => ({ count: 3 }) } as any;
    const next = jasmine.createSpy("next").and.resolveTo(undefined);

    await (mw as any)(api)(next)({ type: "TEST/TRANSFORM" });

    expect(stateTransformer).toHaveBeenCalled();
    expect(actionTransformer).toHaveBeenCalledWith({ type: "TEST/TRANSFORM" });
    expect(prevStateLevel).toHaveBeenCalledWith(transformedState);
    expect(actionLevel).toHaveBeenCalledWith(transformedAction);

    const calls = custom.log.calls.allArgs();
    expect(calls[0]).toEqual([
      "%c prev state",
      "color: #9E9E9E; font-weight: bold",
      transformedState,
    ]);
    expect(calls[1]).toEqual([
      "%c action    ",
      "color: #03A9F4; font-weight: bold",
      transformedAction,
    ]);
  });
});

