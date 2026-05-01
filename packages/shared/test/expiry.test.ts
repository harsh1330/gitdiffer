import { describe, it, expect } from "vitest";
import { computeExpiresAt, isExpired, EXPIRY_DURATIONS_MS } from "../src/expiry.js";

describe("computeExpiresAt", () => {
  it("adds 1 hour for '1h'", () => {
    const now = new Date("2026-05-01T00:00:00Z");
    expect(computeExpiresAt("1h", now)).toBe("2026-05-01T01:00:00.000Z");
  });

  it("adds 7 days for '7d'", () => {
    const now = new Date("2026-05-01T00:00:00Z");
    expect(computeExpiresAt("7d", now)).toBe("2026-05-08T00:00:00.000Z");
  });
});

describe("isExpired", () => {
  it("returns true when expires_at is in the past", () => {
    expect(isExpired("2020-01-01T00:00:00Z", new Date("2026-05-01T00:00:00Z"))).toBe(true);
  });

  it("returns false when expires_at is in the future", () => {
    expect(isExpired("2030-01-01T00:00:00Z", new Date("2026-05-01T00:00:00Z"))).toBe(false);
  });
});

describe("EXPIRY_DURATIONS_MS", () => {
  it("includes all options", () => {
    expect(Object.keys(EXPIRY_DURATIONS_MS).sort()).toEqual(["1h", "24h", "30d", "7d"]);
  });
});
