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
    // Temporarily suppress console and page-level errors for this test
    const origLog = console.log;
    const origError = console.error;
    const origWarn = console.warn;
    const noop = () => {};
    console.log = noop;
    console.error = noop;
    console.warn = noop;
    const origOnError = (window as any).onerror;
    const origOnUnhandled = (window as any).onunhandledrejection;
    (window as any).onerror = () => true;
    (window as any).onunhandledrejection = () => true;

    const token = generateToken();
    expect(token.split(".")).toHaveSize(10);
    expect(isValidToken(token)).toBeTrue();

    const tampered = token.replace(/\./g, "").slice(0, 9) + "x";
    expect(isValidToken(tampered)).toBeFalse();

    // restore
    (window as any).onerror = origOnError;
    (window as any).onunhandledrejection = origOnUnhandled;
    console.log = origLog;
    console.error = origError;
    console.warn = origWarn;
  });
});

