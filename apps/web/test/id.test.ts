import { describe, it, expect } from "vitest";
import { generateId, ID_LENGTH, ID_ALPHABET } from "../src/lib/id";

describe("generateId", () => {
  it("returns a 22-char base62 string", () => {
    const id = generateId();
    expect(id).toHaveLength(ID_LENGTH);
    expect(ID_LENGTH).toBe(22);
    for (const ch of id) {
      expect(ID_ALPHABET).toContain(ch);
    }
  });

  it("produces unique values across many calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(generateId());
    expect(ids.size).toBe(1000);
  });
});
