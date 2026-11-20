import { isRouteErrorResponse } from "react-router";

export type ErrorPageCopy = {
  title: string;
  documentTitle: string;
  message: string;
  stack?: string;
};

const FALLBACK_TITLE = "Something went wrong";
const FALLBACK_MESSAGE = "An unexpected error occurred.";

function withDocumentTitle(
  copy: Omit<ErrorPageCopy, "documentTitle">
): ErrorPageCopy {
  return { ...copy, documentTitle: `${copy.title} — Cadence` };
}

export function describeError(
  error: unknown,
  { exposeDetails }: { exposeDetails: boolean }
): ErrorPageCopy {
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return withDocumentTitle({
        title: "Page not found",
        message:
          "The page you're looking for doesn't exist or may have been moved.",
      });
    }
    return withDocumentTitle({
      title: `Error ${error.status}`,
      message:
        typeof error.data === "string"
          ? error.data
          : error.statusText || FALLBACK_MESSAGE,
    });
  }
  // Only in development: a production stack trace leaks server internals.
  if (exposeDetails && error instanceof Error) {
    return withDocumentTitle({
      title: FALLBACK_TITLE,
      message: error.message,
      stack: error.stack,
    });
  }
  return withDocumentTitle({
    title: FALLBACK_TITLE,
    message: FALLBACK_MESSAGE,
  });
}
