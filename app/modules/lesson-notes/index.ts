import { noteDraftState, type NoteDraftState } from "./lib/draft";

export type { NoteDraftState };

/**
 * What the lesson note editor shows for the text in the box: the character
 * count against the limit, and whether Save does anything. The action
 * rejects an empty or over-long note, so the button says so first.
 */
export function describeNoteDraft(
  draft: string,
  savedBody: string | null
): NoteDraftState {
  return noteDraftState(draft, savedBody);
}
