import { hash, isValidSignature, salt, signature } from "@actioncrew/actionstack";

describe("hash", () => {
  it("salt() returns a fixed-length base36 string", () => {
    const s = salt(12);
    expect(typeof s).toBe("string");
    expect(s.length).toBe(12);
    expect(/^[0-9a-z]+$/.test(s)).toBeTrue();
  });

  it("hash() is deterministic and always 3 chars", () => {
    expect(hash("abc")).toBe(hash("abc"));
    expect(hash("abc").length).toBe(3);
  });

  it("signature() produces a valid signature and isValidSignature() validates it", () => {
    const sig = signature();
    expect(sig.split(".")).toHaveSize(10);
    expect(isValidSignature(sig)).toBeTrue();

    const tampered = sig.replace(/\./g, "").slice(0, 9) + "x";
    expect(isValidSignature(tampered)).toBeFalse();
  });
});
