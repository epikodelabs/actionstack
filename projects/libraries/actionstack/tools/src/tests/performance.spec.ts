import { perfmon } from "@epikodelabs/actionstack/tools";

describe("perfmon", () => {
  beforeEach(() => {
    spyOn(console, "groupCollapsed").and.stub();
    spyOn(console, "groupEnd").and.stub();
  });

  it("has a stable signature property", () => {
    expect((perfmon as any).signature).toBe("2.m.z.d.u.x.w.l.v.e");
  });

  it("calls next(action) and logs a performance group", async () => {
    const next = jasmine.createSpy("next").and.callFake(async () => {});
    const mw = (perfmon as any)()(next);

    await mw({ type: "TEST/PERF" });

    expect(next).toHaveBeenCalledWith({ type: "TEST/PERF" });
    expect(console.groupCollapsed).toHaveBeenCalled();
    const msg = String((console.groupCollapsed as any).calls.mostRecent().args[0]);
    expect(msg).toContain("TEST/PERF");
    expect(console.groupEnd).toHaveBeenCalled();
  });

  it("marks system actions differently from non-system actions", async () => {
    const next = jasmine.createSpy("next").and.callFake(async () => {});
    const mw = (perfmon as any)()(next);

    await mw({ type: "system/INIT" });
    const systemMsg = String(
      (console.groupCollapsed as any).calls.mostRecent().args[0]
    );

    await mw({ type: "APP/INIT" });
    const appMsg = String(
      (console.groupCollapsed as any).calls.mostRecent().args[0]
    );

    expect(systemMsg).toContain("system/INIT");
    expect(appMsg).toContain("APP/INIT");
    expect(systemMsg).not.toEqual(appMsg);
  });
});

