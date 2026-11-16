import type { DenialReason } from "./decisions.server";

/** The HTTP status and the one message for each denial reason. */
export function denialStatusAndMessage(reason: DenialReason): {
  status: 401 | 403 | 404;
  message: string;
} {
  switch (reason.kind) {
    case "signed-out":
      return { status: 401, message: "Sign in to continue." };
    case "course-not-found":
      return { status: 404, message: "Course not found." };
    case "no-enrollment":
      return { status: 403, message: "You must be enrolled in this course." };
    case "outside-purchase-country":
      return {
        status: 403,
        message:
          "This course was bought at a discount in another country, so it can only be taken from there.",
      };
    case "not-course-manager":
      return {
        status: 403,
        message: "Only this course's instructor can do that.",
      };
  }
}
