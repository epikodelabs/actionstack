import { generateToken, hash, isValidToken, salt } from "@epikodelabs/actionstack";

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

  it("generateToken() produces a valid token and isValidToken() validates it", () => {
    const token = generateToken();
    expect(token.split(".")).toHaveSize(10);
    expect(isValidToken(token)).toBeTrue();

    const tampered = token.replace(/\./g, "").slice(0, 9) + "x";
    expect(isValidToken(tampered)).toBeFalse();
  });
});
