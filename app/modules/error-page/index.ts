import {
  describeError as describe,
  type ErrorPageCopy,
} from "./lib/describe-error";

export type { ErrorPageCopy };

/**
 * The heading, message and browser tab title for the root error page.
 * Pass `exposeDetails: true` only in development, to show the thrown
 * error's message and stack.
 */
export function describeError(
  error: unknown,
  options: { exposeDetails: boolean }
): ErrorPageCopy {
  return describe(error, options);
}
