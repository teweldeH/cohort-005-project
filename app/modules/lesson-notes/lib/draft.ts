import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteDraftState = {
  length: number;
  maxLength: number;
  tooLong: boolean;
  empty: boolean;
  /** The draft matches what is saved, so there is nothing to save. */
  saved: boolean;
  canSave: boolean;
};

export function noteDraftState(
  draft: string,
  savedBody: string | null
): NoteDraftState {
  const tooLong = draft.length > MAX_NOTE_LENGTH;
  const empty = draft.trim().length === 0;
  const saved = draft === savedBody;
  return {
    length: draft.length,
    maxLength: MAX_NOTE_LENGTH,
    tooLong,
    empty,
    saved,
    canSave: !tooLong && !empty && !saved,
  };
}
