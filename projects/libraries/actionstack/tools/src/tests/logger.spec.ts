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

    const api = { getState: () => ({ count: 5 }) } as any;
    const next = jasmine.createSpy("next").and.resolveTo(undefined);

    await (mw as any)(api)(next)({ type: "TEST/TRANSFORM" });

    expect(stateTransformer).toHaveBeenCalled();
    expect(actionTransformer).toHaveBeenCalled();
    expect(prevStateLevel).toHaveBeenCalled();
    expect(actionLevel).toHaveBeenCalled();
  });

  it("uses colors for prevState when provided", async () => {
    const custom = makeLogger();
    const mw = createLogger({
      logger: custom,
      colors: {
        prevState: (state: any) => "#FF0000",
      },
    } as any);

    const api = { getState: () => ({ count: 0 }) } as any;
    const next = jasmine.createSpy("next").and.resolveTo(undefined);

    await (mw as any)(api)(next)({ type: "TEST/COLOR_PREV" });

    expect(custom.log).toHaveBeenCalled();
  });

  it("uses colors for action when provided", async () => {
    const custom = makeLogger();
    const mw = createLogger({
      logger: custom,
      colors: {
        action: (action: any) => "#00FF00",
      },
    } as any);

    const api = { getState: () => ({}) } as any;
    const next = jasmine.createSpy("next").and.resolveTo(undefined);

    await (mw as any)(api)(next)({ type: "TEST/COLOR_ACTION" });

    expect(custom.log).toHaveBeenCalled();
  });

  it("uses colors for nextState when provided", async () => {
    const custom = makeLogger();
    const mw = createLogger({
      logger: custom,
      colors: {
        nextState: (state: any) => "#0000FF",
      },
    } as any);

    const api = { getState: () => ({}) } as any;
    const next = jasmine.createSpy("next").and.resolveTo(undefined);

    await (mw as any)(api)(next)({ type: "TEST/COLOR_NEXT" });

    expect(custom.log).toHaveBeenCalled();
  });

  it("uses colors.title when provided with default formatter", async () => {
    const custom = makeLogger();
    const mw = createLogger({
      logger: custom,
      colors: {
        title: (action: any) => "#FFAA00",
      },
    } as any);

    const api = { getState: () => ({}) } as any;
    const next = jasmine.createSpy("next").and.resolveTo(undefined);

    await (mw as any)(api)(next)({ type: "TEST/COLOR_TITLE" });

    expect(custom.group).toHaveBeenCalled();
  });

  it("enables timestamp and duration in title", async () => {
    const custom = makeLogger();
    const mw = createLogger({
      logger: custom,
      timestamp: true,
      duration: true,
    } as any);

    const api = { getState: () => ({}) } as any;
    const next = jasmine.createSpy("next").and.resolveTo(undefined);

    await (mw as any)(api)(next)({ type: "TEST/TIME_DURATION" });

    expect(custom.group).toHaveBeenCalled();
  });

  it("uses custom titleFormatter", async () => {
    const custom = makeLogger();
    const titleFormatter = jasmine
      .createSpy("titleFormatter")
      .and.returnValue("Custom Title");

    const mw = createLogger({
      logger: custom,
      titleFormatter,
    } as any);

    const api = { getState: () => ({}) } as any;
    const next = jasmine.createSpy("next").and.resolveTo(undefined);

    await (mw as any)(api)(next)({ type: "TEST/CUSTOM_TITLE" });

    expect(titleFormatter).toHaveBeenCalled();
    expect(custom.group).toHaveBeenCalled();
  });

  it("uses errorTransformer when error occurs", async () => {
    const custom = makeLogger();
    const transformedError = new Error("transformed");
    const errorTransformer = jasmine
      .createSpy("errorTransformer")
      .and.returnValue(transformedError);

    const mw = createLogger({
      logger: custom,
      errorTransformer,
    } as any);

    const api = { getState: () => ({}) } as any;
    const next = async () => {
      throw new Error("original");
    };

    await expectAsync(
      (mw as any)(api)(next)({ type: "TEST/ERROR_TRANSFORM" })
    ).toBeRejectedWithError("transformed");

    expect(errorTransformer).toHaveBeenCalled();
  });

  it("handles level as object with function returning falsy value", async () => {
    const custom = makeLogger();
    const mw = createLogger({
      logger: custom,
      level: {
        prevState: () => false,
        action: () => null,
        nextState: () => "",
      },
    } as any);

    const api = { getState: () => ({}) } as any;
    const next = jasmine.createSpy("next").and.resolveTo(undefined);

    await (mw as any)(api)(next)({ type: "TEST/FALSY_LEVEL" });

    expect(custom.group).toHaveBeenCalled();
  });

  it("handles groupCollapsed with colors.title and default formatter", async () => {
    const custom = makeLogger();
    const mw = createLogger({
      logger: custom,
      collapsed: true,
      colors: {
        title: (action: any) => "#123456",
      },
    } as any);

    const api = { getState: () => ({}) } as any;
    const next = jasmine.createSpy("next").and.resolveTo(undefined);

    await (mw as any)(api)(next)({ type: "TEST/COLLAPSED_COLOR" });

    expect(custom.groupCollapsed).toHaveBeenCalled();
  });

  it("handles groupCollapsed without colors when using custom titleFormatter", async () => {
    const custom = makeLogger();
    const mw = createLogger({
      logger: custom,
      collapsed: true,
      titleFormatter: () => "Custom",
      colors: {
        title: () => "#FF0000",
      },
    } as any);

    const api = { getState: () => ({}) } as any;
    const next = jasmine.createSpy("next").and.resolveTo(undefined);

    await (mw as any)(api)(next)({ type: "TEST/CUSTOM_COLLAPSED" });

    expect(custom.groupCollapsed).toHaveBeenCalled();
  });

  it("handles group without colors when using custom titleFormatter", async () => {
    const custom = makeLogger();
    const mw = createLogger({
      logger: custom,
      collapsed: false,
      titleFormatter: () => "Custom",
      colors: {
        title: () => "#00FF00",
      },
    } as any);

    const api = { getState: () => ({}) } as any;
    const next = jasmine.createSpy("next").and.resolveTo(undefined);

    await (mw as any)(api)(next)({ type: "TEST/CUSTOM_GROUP" });

    expect(custom.group).toHaveBeenCalled();
  });

  it("enables timestamp and duration in title", async () => {
    const custom = makeLogger();
    const mw = createLogger({
      logger: custom,
      timestamp: true,
      duration: true,
    } as any);

    const api = { getState: () => ({}) } as any;
    const next = jasmine.createSpy("next").and.resolveTo(undefined);

    await (mw as any)(api)(next)({ type: "TEST/TIME_DURATION" });

    expect(custom.group).toHaveBeenCalled();
  });
});

