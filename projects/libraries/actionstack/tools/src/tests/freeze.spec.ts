import { storeFreeze } from "@actioncrew/actionstack/tools";

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
});
