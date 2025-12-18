import { logger } from "@actioncrew/actionstack/tools";

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
