import { storeFreeze } from "@epikodelabs/actionstack/tools";

describe("storeFreeze", () => {
  it("deep-freezes state and payload before reducer, and freezes nextState", async () => {
    const baseState = { nested: { a: 1 } };
    const action: any = { type: "TEST/FREEZE", payload: { nested: { b: 2 } } };

    const reducer = async (state: any, act: any) => {
      expect(Object.isFrozen(state)).toBeTrue();
      expect(Object.isFrozen(state.nested)).toBeTrue();
      expect(Object.isFrozen(act.payload)).toBeTrue();
      expect(Object.isFrozen(act.payload.nested)).toBeTrue();
      return { ...state, nested: { ...state.nested, a: 2 } };
    };

    const frozenReducer = await storeFreeze(reducer as any);
    const nextState = await frozenReducer(baseState, action);

    expect(nextState).toEqual({ nested: { a: 2 } });
    expect(Object.isFrozen(nextState)).toBeTrue();
    expect(Object.isFrozen(nextState.nested)).toBeTrue();
  });

  it("handles undefined state and falsy payload without throwing", async () => {
    const reducer = async (state: any, action: any) => ({ ...state, ok: true, type: action.type });
    const frozenReducer = await storeFreeze(reducer as any);

    const nextState = await frozenReducer(undefined, { type: "TEST/NO_PAYLOAD", payload: 0 } as any);

    expect(nextState.ok).toBeTrue();
    expect(Object.isFrozen(nextState)).toBeTrue();
  });

  it("deep-freezes function values while skipping caller/callee/arguments", async () => {
    const fn: any = function demo() {};
    fn.inner = { x: 1 };

    const reducer = async (state: any) => state;
    const frozenReducer = await storeFreeze(reducer as any);

    const nextState = await frozenReducer({ fn, nil: null } as any, { type: "TEST/FN" } as any);

    expect(Object.isFrozen(nextState.fn)).toBeTrue();
    expect(Object.isFrozen(nextState.fn.inner)).toBeTrue();
  });
});

