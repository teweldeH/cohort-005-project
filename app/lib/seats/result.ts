import type { Result } from "~/lib/result";

export { refuse } from "~/lib/result";

/** What every Seat management operation returns. See `Result`. */
export type SeatResult<T extends object, Reason extends string> = Result<
  T,
  Reason
>;
