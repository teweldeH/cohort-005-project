import { RefundRequestStatus } from "~/db/schema";

/** A Refund Request's status, as the Buyer and the Admins both see it. */
export function RefundRequestBadge({ status }: { status: RefundRequestStatus }) {
  switch (status) {
    case RefundRequestStatus.Requested:
      return (
        <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          Pending Refund Request
        </span>
      );
    case RefundRequestStatus.Approved:
      return (
        <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
          Refunded
        </span>
      );
    case RefundRequestStatus.Declined:
      return (
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          Declined
        </span>
      );
  }
}
