import { cn } from "~/lib/utils";

/** A Seat holder's % of lessons completed, or "Finished". */
export function SeatProgressBar({
  percent,
  finished,
}: {
  percent: number;
  finished: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-2 w-24 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Lessons completed"
      >
        <div
          className={cn("h-full", finished ? "bg-green-600" : "bg-primary")}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {finished ? "Finished" : `${percent}%`}
      </span>
    </div>
  );
}
