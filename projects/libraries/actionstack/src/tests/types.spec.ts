import {
  isAction,
  isAsync,
  isAtom,
  isBoxed,
  isPlainObject,
  isPromise,
  kindOf,
} from "@epikodelabs/actionstack";
import { atom } from '@epikodelabs/streamix';

describe("kindOf", () => {
  const stream = atom(1);

  const cases: Array<[string, any, string]> = [
    ["undefined", undefined, "undefined"],
    ["null", null, "null"],
    ["boolean", true, "boolean"],
    ["string", "x", "string"],
    ["number", 1, "number"],
    ["bigint", 1n, "bigint"],
    ["symbol", Symbol("x"), "symbol"],
    ["function", () => {}, "function"],
    ["array", [1, 2], "array"],
    ["date", new Date(), "date"],
    ["error", new Error("x"), "error"],
    ["stream", stream, "Atom"],
    ["promise", Promise.resolve(1), "promise"],
    ["map", new Map(), "Map"],
    ["set", new Set(), "Set"],
    ["weakMap", new WeakMap(), "WeakMap"],
    ["weakSet", new WeakSet(), "WeakSet"],
    ["regexp", /x/i, "regexp"],
    ["arrayBuffer", new ArrayBuffer(8), "arraybuffer"],
    ["dataView", new DataView(new ArrayBuffer(8)), "dataview"],
    ["int8Array", new Int8Array(2), "int8array"],
    ["uint8Array", new Uint8Array(2), "uint8array"],
    ["float32Array", new Float32Array(2), "float32array"],
    ["boxedNumber", Object(1), "number"],
    ["boxedString", Object("x"), "string"],
    ["boxedBoolean", Object(true), "boolean"],
    ["boxedSymbol", Object(Symbol("x")), "Symbol"],
    ["plainObject", { a: 1 }, "object"],
  ];

  for (const [name, value, expected] of cases) {
    it(`returns ${expected} for ${name}`, () => {
      expect(kindOf(value)).toBe(expected);
    });
  }

  it("trims spaces from toString tags", () => {
    const o = { [Symbol.toStringTag]: "My Tag" };
    expect(kindOf(o)).toBe("mytag");
  });
});

describe("isPlainObject", () => {
  class C {
    x = 1;
  }

  const cases: Array<[string, any, boolean]> = [
    ["empty", {}, true],
    ["literal", { a: 1 }, true],
    ["objectCreateObjectProto", Object.create(Object.prototype), true],
    ["array", [], false],
    ["date", new Date(), false],
    ["regexp", /x/, false],
    ["map", new Map(), false],
    ["set", new Set(), false],
    ["promise", Promise.resolve(1), false],
    ["classInstance", new C(), false],
    ["function", () => {}, false],
    ["nullProto", Object.create(null), false],
    ["customProto", Object.create({ a: 1 }), false],
  ];

  for (const [name, value, expected] of cases) {
    it(`${name} => ${expected}`, () => {
      expect(isPlainObject(value)).toBe(expected);
    });
  }
});

describe("isBoxed", () => {
  const cases: Array<[string, any, boolean]> = [
    ["number", new Number(1), true],
    ["string", new String("x"), true],
    ["boolean", new Boolean(false), true],
    ["symbol", Object(Symbol("x")), true],
    ["bigint", Object(1n), true],
    ["primitiveNumber", 1, false],
    ["primitiveString", "x", false],
    ["primitiveBoolean", true, false],
    ["null", null, false],
    ["undefined", undefined, false],
    ["object", { a: 1 }, false],
  ];

  for (const [name, value, expected] of cases) {
    it(`${name} => ${expected}`, () => {
      expect(isBoxed(value)).toBe(expected);
    });
  }
});

describe("isPromise", () => {
  const cases: Array<[string, any, boolean]> = [
    ["resolved", Promise.resolve(1), true],
    ["rejected", Promise.reject(new Error("x")).catch(() => {}), true],
    ["newPromise", new Promise<void>((r) => r()), true],
    ["asyncReturn", (async () => 1)(), true],
    ["plainObject", { a: 1 }, false],
    ["thenable", { then: () => {} }, false],
    ["null", null, false],
    ["undefined", undefined, false],
  ];

  for (const [name, value, expected] of cases) {
    it(`${name} => ${expected}`, () => {
      expect(isPromise(value)).toBe(expected);
    });
  }
});

describe("isAtom", () => {
  const cases: Array<[string, any, boolean]> = [
    ["valid", { type: "atom" }, true],
    ["subscribeNotChecked", { type: "atom", subscribe: 123 }, true],
    ["wrongType", { type: "stream", subscribe: () => ({ unsubscribe() {} }) }, false],
    ["wrongCase", { type: "Atom" }, false],
    ["null", null, false],
    ["undefined", undefined, false],
  ];

  for (const [name, value, expected] of cases) {
    it(`${name} => ${expected}`, () => {
      expect(isAtom(value)).toBe(expected);
    });
  }
});

describe("isAction", () => {
  const cases: Array<[string, any, boolean]> = [
    ["simple", { type: "A" }, true],
    ["withPayload", { type: "A", payload: 1 }, true],
    ["nonStringType", { type: 1 }, false],
    ["missingType", { payload: 1 }, false],
    ["null", null, false],
    ["undefined", undefined, false],
    ["array", Object.assign([], { type: "A" }), false],
    ["nullProto", Object.assign(Object.create(null), { type: "A" }), false],
  ];

  for (const [name, value, expected] of cases) {
    it(`${name} => ${expected}`, () => {
      expect(isAction(value)).toBe(expected);
    });
  }
});

describe("isAsync", () => {
  it("detects async functions", () => {
    const fn = async () => 1;
    expect(isAsync(fn)).toBeTrue();
  });

  it("returns false for sync functions", () => {
    const fn = () => 1;
    expect(isAsync(fn)).toBeFalse();
  });

  it("returns false for arrow functions", () => {
    const fn = () => {};
    expect(isAsync(fn)).toBeFalse();
  });
});


describe("BoundAction and ThunkCreator inference", () => {
  it("infers thunk result types through bound module actions", async () => {
    const { createThunk } = await import("@epikodelabs/actionstack");
    const creator = createThunk("TYPES/ANSWER", () => async () => 42);
    // Runtime assigns the creator's metadata onto the dispatch function, so the
    // intersection below matches what Object.defineProperties produces.
    const bound = Object.assign(async () => 42, { type: "TYPES/ANSWER" }) as unknown as import("@epikodelabs/actionstack").BoundAction<typeof creator>;

    const value: number = await bound();
    expect(value).toBe(42);
    expect(bound.type).toBe("TYPES/ANSWER");
  });

  it("preserves creator argument types", async () => {
    const { createThunk } = await import("@epikodelabs/actionstack");
    const creator = createThunk("TYPES/ECHO", (text: string) => async () => text.length);
    const bound = Object.assign(
      async (text: string) => text.length,
      { type: "TYPES/ECHO" }
    ) as unknown as import("@epikodelabs/actionstack").BoundAction<typeof creator>;

    // @ts-expect-error — the bound method keeps the creator's argument contract
    bound(123);
    const length: number = await bound("abcd");
    expect(length).toBe(4);
  });
});
