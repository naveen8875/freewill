import { describe, expect, it } from "vitest";
import { stableHash } from "./stableHash";

describe("stableHash", () => {
  it("matches the JSON persistence boundary for optional fields", () => {
    const value = { kept: 1, omitted: undefined, nested: { value: "yes", omitted: undefined }, list: [1, undefined, 3] };
    expect(stableHash(value)).toBe(stableHash(JSON.parse(JSON.stringify(value))));
  });
});
