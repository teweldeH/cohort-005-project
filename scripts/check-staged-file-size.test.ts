import { describe, expect, it } from "vitest";
import {
  estimateTokens,
  findOversizedFiles,
  formatReport,
  MAX_TOKENS,
  splitGuidance,
  type StagedFile,
} from "./check-staged-file-size";

const LIMIT_BYTES = MAX_TOKENS * 4;

function staged(path: string, bytes: number, binary = false): StagedFile {
  return { path, bytes, binary };
}

describe("estimateTokens", () => {
  it("counts four bytes as one token, rounding up", () => {
    expect(estimateTokens(40_000)).toBe(10_000);
    expect(estimateTokens(40_001)).toBe(10_001);
  });
});

describe("findOversizedFiles", () => {
  it("allows a file exactly at the limit", () => {
    expect(findOversizedFiles([staged("app/a.ts", LIMIT_BYTES)])).toEqual([]);
  });

  it("flags a file one token over the limit", () => {
    const file = staged("app/a.ts", LIMIT_BYTES + 4);
    expect(findOversizedFiles([file])).toEqual([file]);
  });

  it("ignores binary files, lockfiles and generated files", () => {
    const huge = LIMIT_BYTES * 10;
    expect(
      findOversizedFiles([
        staged("public/hero.png", huge, true),
        staged("package-lock.json", huge),
        staged("drizzle/meta/0007_snapshot.json", huge),
        staged("eslint-suppressions.json", huge),
      ])
    ).toEqual([]);
  });
});

describe("splitGuidance", () => {
  it("tells a test file to split by describe block", () => {
    expect(splitGuidance("app/lib/purchase.test.ts")).toContain("describe");
  });

  it("tells a route to move data work into a module", () => {
    expect(splitGuidance("app/routes/instructor.$courseId.tsx")).toContain(
      "app/modules/"
    );
  });

  it("tells a module to keep its entry point", () => {
    expect(
      splitGuidance("app/modules/instructor-analytics/lib/analytics.ts")
    ).toContain("entry point");
  });
});

describe("formatReport", () => {
  it("names the file, its estimated size and how many files to aim for", () => {
    const report = formatReport([
      staged("app/routes/instructor.$courseId.tsx", 71_304),
    ]);
    expect(report).toContain("app/routes/instructor.$courseId.tsx");
    expect(report).toContain("~17,826 tokens");
    expect(report).toContain("about 4 files");
  });
});
