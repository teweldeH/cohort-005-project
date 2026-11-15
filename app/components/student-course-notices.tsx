import { Link } from "react-router";
import { Eye, UserMinus } from "lucide-react";
import type { StudentCourseNotice } from "~/lib/seats/index.server";

function Notice({
  notice,
  buyLink,
}: {
  notice: StudentCourseNotice;
  buyLink: string;
}) {
  switch (notice.kind) {
    case "progress-visible":
      return (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Eye className="mt-0.5 size-4 shrink-0" />
          <span>
            Your progress on this course will be visible to {notice.buyerName}.
          </span>
        </p>
      );
    case "released":
      return (
        <div
          role="status"
          className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <UserMinus className="mt-0.5 size-4 shrink-0" />
          <span>
            Your Seat on this course was Released by {notice.buyerName}, so
            you no longer have access. Your progress is kept.{" "}
            <Link to={buyLink} className="font-medium underline">
              Buy the course yourself
            </Link>{" "}
            to carry on.
          </span>
        </div>
      );
  }
}

/** What the course page tells a Student about their Seat on the course. */
export function StudentCourseNotices({
  notices,
  buyLink,
}: {
  notices: StudentCourseNotice[];
  /** Where the Student can buy the course for themselves. */
  buyLink: string;
}) {
  if (notices.length === 0) return null;

  return (
    <div className="space-y-2">
      {notices.map((notice) => (
        <Notice key={notice.kind} notice={notice} buyLink={buyLink} />
      ))}
    </div>
  );
}
