import {
  errorPageCopy,
  type ErrorPageCopy,
  type ErrorPageOptions,
} from "./lib/error-page-copy";

export type { ErrorPageCopy, ErrorPageOptions };

/**
 * The heading, message and browser tab title for the root error page.
 * Pass `exposeDetails: true` only in development, to show the thrown
 * error's message and stack.
 */
export function describeError(
  error: unknown,
  options: ErrorPageOptions
): ErrorPageCopy {
  return errorPageCopy(error, options);
}
