import { describe, it, expect } from "vitest";
import { validateCreateRequest } from "../src/lib/validate";

describe("validateCreateRequest", () => {
  it("accepts a valid request", () => {
    const result = validateCreateRequest({ diff: "diff --git a/x b/x\n", expires_in: "7d" });
    expect(result.ok).toBe(true);
  });

  it("rejects missing diff", () => {
    const result = validateCreateRequest({ diff: "", expires_in: "7d" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.error).toBe("empty_diff");
  });

  it("rejects oversize diff", () => {
    const big = "a".repeat(1024 * 1024 + 1);
    const result = validateCreateRequest({ diff: big, expires_in: "7d" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.error).toBe("diff_too_large");
  });

  it("rejects invalid expiry", () => {
    const result = validateCreateRequest({ diff: "x", expires_in: "999y" as never });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.error).toBe("invalid_expiry");
  });

  it("rejects non-string diff", () => {
    const result = validateCreateRequest({ diff: 42 as never, expires_in: "7d" });
    expect(result.ok).toBe(false);
  });
});
