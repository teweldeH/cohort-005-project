import { describe, it, expect } from "vitest";
import { describeNoteDraft } from "../index";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

describe("describeNoteDraft", () => {
  it("counts the characters against the note limit", () => {
    const state = describeNoteDraft("hello", null);
    expect(state.length).toBe(5);
    expect(state.maxLength).toBe(MAX_NOTE_LENGTH);
  });

  it("lets a new note with text be saved", () => {
    expect(describeNoteDraft("first thought", null)).toMatchObject({
      empty: false,
      tooLong: false,
      saved: false,
      canSave: true,
    });
  });

  it("does not save an empty or whitespace-only note", () => {
    expect(describeNoteDraft("", null)).toMatchObject({
      empty: true,
      canSave: false,
    });
    expect(describeNoteDraft("   \n ", null)).toMatchObject({
      empty: true,
      canSave: false,
    });
  });

  it("allows a note of exactly the limit", () => {
    const state = describeNoteDraft("a".repeat(MAX_NOTE_LENGTH), null);
    expect(state.tooLong).toBe(false);
    expect(state.canSave).toBe(true);
  });

  it("does not save a note one character over the limit", () => {
    const state = describeNoteDraft("a".repeat(MAX_NOTE_LENGTH + 1), null);
    expect(state.tooLong).toBe(true);
    expect(state.canSave).toBe(false);
  });

  it("treats a draft that matches the saved note as saved", () => {
    expect(describeNoteDraft("same", "same")).toMatchObject({
      saved: true,
      canSave: false,
    });
  });

  it("lets an edited note be saved again", () => {
    expect(describeNoteDraft("same, edited", "same")).toMatchObject({
      saved: false,
      canSave: true,
    });
  });

  it("does not treat an empty draft as saved when there is no note", () => {
    expect(describeNoteDraft("", null).saved).toBe(false);
  });
});
