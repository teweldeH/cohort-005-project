import { Eye } from "lucide-react";
import type { StudentCourseNotice } from "~/lib/seats/index.server";

function Notice({ notice }: { notice: StudentCourseNotice }) {
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
  }
}

/** What the course page tells a Student about their Seat on the course. */
export function StudentCourseNotices({
  notices,
}: {
  notices: StudentCourseNotice[];
}) {
  if (notices.length === 0) return null;

  return (
    <div className="space-y-2">
      {notices.map((notice) => (
        <Notice key={notice.kind} notice={notice} />
      ))}
    </div>
  );
}
