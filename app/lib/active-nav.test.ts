import { describe, it, expect } from "vitest";
import { activeNavTarget } from "./active-nav";

const targets = ["/courses", "/instructor", "/instructor/analytics"];

describe("activeNavTarget", () => {
  it("picks the nested target over the one it sits inside", () => {
    expect(activeNavTarget(targets, "/instructor/analytics")).toBe(
      "/instructor/analytics"
    );
  });

  it("picks the nested target whatever order the targets come in", () => {
    expect(
      activeNavTarget([...targets].reverse(), "/instructor/analytics")
    ).toBe("/instructor/analytics");
  });

  it("keeps the parent for its other sub-pages", () => {
    expect(activeNavTarget(targets, "/instructor/42/students")).toBe(
      "/instructor"
    );
  });

  it("matches a target exactly", () => {
    expect(activeNavTarget(targets, "/instructor")).toBe("/instructor");
  });

  it("does not match a sibling that only shares a prefix", () => {
    expect(activeNavTarget(targets, "/instructors")).toBeNull();
  });

  it("is null when no target contains the path", () => {
    expect(activeNavTarget(targets, "/settings")).toBeNull();
  });
});
