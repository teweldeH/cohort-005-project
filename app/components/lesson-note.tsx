import { useState } from "react";
import { useFetcher } from "react-router";
import { Lock, NotebookPen } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { cn, formatRelativeTime } from "~/lib/utils";
import { describeNoteDraft } from "~/modules/lesson-notes";

export type LessonNoteData = { body: string; updatedAt: string } | null;

/**
 * The Student's private note on a lesson. Laid out like the Questions &
 * Discussion card further down the page, so the two read as one family.
 *
 * Key it by lesson: the draft is local state seeded from the saved note.
 */
export function LessonNote({ note }: { note: LessonNoteData }) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [draft, setDraft] = useState(note?.body ?? "");
  const isSaving = fetcher.state !== "idle";
  const error = isSaving ? undefined : fetcher.data?.error;
  const state = describeNoteDraft(draft, note?.body ?? null);

  return (
    <Card className="mb-8 gap-0">
      <CardContent className="px-6">
        <NoteHeader />

        <fetcher.Form method="post" className="space-y-2">
          <input type="hidden" name="intent" value="save-note" />
          <Textarea
            name="body"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Jot down what you want to remember from this lesson..."
            aria-label="Your notes"
            className="min-h-32 resize-y"
          />

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              size="sm"
              disabled={isSaving || !state.canSave}
            >
              {isSaving ? "Saving..." : "Save note"}
            </Button>

            {error ? (
              <span className="text-sm text-destructive">{error}</span>
            ) : (
              <NoteStatus note={note} unsaved={state.unsaved} />
            )}

            <span
              className={cn(
                "ml-auto text-xs",
                state.tooLong ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {state.length} / {state.maxLength}
            </span>
          </div>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function NoteStatus({
  note,
  unsaved,
}: {
  note: LessonNoteData;
  unsaved: boolean;
}) {
  if (unsaved) {
    return (
      <span className="text-xs text-muted-foreground">Unsaved changes</span>
    );
  }
  if (!note) return null;
  return (
    <span suppressHydrationWarning className="text-xs text-muted-foreground">
      Saved · last edited {formatRelativeTime(note.updatedAt)}
    </span>
  );
}

function NoteHeader() {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-2">
        <NotebookPen className="size-5 text-primary" />
        <h2 className="text-xl font-semibold">Your notes</h2>
      </div>
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Lock className="size-3" />
        Only you can see these
      </span>
    </div>
  );
}
