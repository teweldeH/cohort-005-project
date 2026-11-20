import { describe, expect, it } from "vitest";
import { describeError } from "../index";

// The shape React Router hands the boundary for a thrown `data()` response.
function thrownResponse(status: number, body: unknown, statusText = "") {
  return { status, statusText, data: body, internal: false };
}

describe("describeError", () => {
  it("titles a 404 'Page not found — Cadence'", () => {
    const copy = describeError(thrownResponse(404, "Not Found"), {
      exposeDetails: false,
    });
    expect(copy).toEqual({
      title: "Page not found",
      documentTitle: "Page not found — Cadence",
      message:
        "The page you're looking for doesn't exist or may have been moved.",
    });
  });

  it("titles another status by its code and shows a string body", () => {
    const copy = describeError(thrownResponse(403, "Not your course"), {
      exposeDetails: false,
    });
    expect(copy).toEqual({
      title: "Error 403",
      documentTitle: "Error 403 — Cadence",
      message: "Not your course",
    });
  });

  it("falls back to the status text when the body is not a string", () => {
    const copy = describeError(
      thrownResponse(500, { reason: "x" }, "Internal Server Error"),
      { exposeDetails: false }
    );
    expect(copy.message).toBe("Internal Server Error");
  });

  it("falls back to the generic message with no body or status text", () => {
    const copy = describeError(thrownResponse(500, null), {
      exposeDetails: false,
    });
    expect(copy.message).toBe("An unexpected error occurred.");
  });

  it("hides a thrown Error's details unless asked to expose them", () => {
    const error = new Error("db exploded");
    expect(describeError(error, { exposeDetails: false })).toEqual({
      title: "Something went wrong",
      documentTitle: "Something went wrong — Cadence",
      message: "An unexpected error occurred.",
    });
    expect(describeError(error, { exposeDetails: true })).toEqual({
      title: "Something went wrong",
      documentTitle: "Something went wrong — Cadence",
      message: "db exploded",
      stack: error.stack,
    });
  });

  it("treats a thrown non-Error as unknown even when exposing details", () => {
    expect(describeError("boom", { exposeDetails: true })).toEqual({
      title: "Something went wrong",
      documentTitle: "Something went wrong — Cadence",
      message: "An unexpected error occurred.",
    });
  });
});
