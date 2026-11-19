import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteDraftState = {
  length: number;
  maxLength: number;
  tooLong: boolean;
  empty: boolean;
  /** The draft matches what is saved, so there is nothing to save. */
  saved: boolean;
  /** The box no longer shows what is saved, including a cleared box. */
  unsaved: boolean;
  canSave: boolean;
};

export function noteDraftState(
  draft: string,
  savedBody: string | null
): NoteDraftState {
  // The server trims before it validates and stores, so compare and measure
  // what it would store, not the raw box.
  const body = draft.trim();
  const tooLong = body.length > MAX_NOTE_LENGTH;
  const empty = body.length === 0;
  const saved = body === savedBody;
  const unsaved = body !== (savedBody ?? "");
  return {
    length: body.length,
    maxLength: MAX_NOTE_LENGTH,
    tooLong,
    empty,
    saved,
    unsaved,
    canSave: !tooLong && !empty && unsaved,
  };
}
