import { describe, it, expect } from "vitest";
import { summarise } from "../index";

describe("summarise", () => {
  it("counts the words in some text", () => {
    expect(summarise("deep modules hide things")).toBe("4 words");
  });

  it("says a single word in the singular, and handles blank text", () => {
    expect(summarise("  hello ")).toBe("1 word");
    expect(summarise("   ")).toBe("0 words");
  });
});
