import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { getNote, listNotesForStudent, saveNote } from "./notes.server";
import { MAX_NOTE_LENGTH } from "./notes";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

function minutesAfter(minutes: number) {
  return new Date(NOW.getTime() + minutes * 60_000);
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

describe("saving a Note", () => {
  it("creates a Note with the body trimmed", () => {
    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "  Rewatch 4:10  ",
      NOW
    );

    expect(result).toMatchObject({ ok: true });
    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "Rewatch 4:10",
      updatedAt: NOW.toISOString(),
    });
  });

  it("replaces the body and moves the last-edited time on when saved again", () => {
    saveNote(db, base.user.id, lessonIds[0], "First thought", NOW);
    const later = minutesAfter(30);

    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "Second thought",
      later
    );

    expect(result).toMatchObject({
      ok: true,
      note: {
        body: "Second thought",
        createdAt: NOW.toISOString(),
        updatedAt: later.toISOString(),
      },
    });
    expect(listNotesForStudent(db, base.user.id)).toHaveLength(1);
  });

  it("keeps characters like # and * exactly as typed", () => {
    saveNote(db, base.user.id, lessonIds[0], "# not a heading *really*", NOW);

    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe(
      "# not a heading *really*"
    );
  });

  it(`accepts a Note of exactly ${MAX_NOTE_LENGTH} characters`, () => {
    const body = "a".repeat(MAX_NOTE_LENGTH);

    expect(saveNote(db, base.user.id, lessonIds[0], body, NOW)).toMatchObject({
      ok: true,
    });
  });

  it(`refuses a Note over ${MAX_NOTE_LENGTH} characters`, () => {
    const body = "a".repeat(MAX_NOTE_LENGTH + 1);

    expect(saveNote(db, base.user.id, lessonIds[0], body, NOW)).toEqual({
      ok: false,
      error: "A note must be 2,000 characters or fewer.",
    });
    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
  });

  it("clears the Note when saved empty", () => {
    saveNote(db, base.user.id, lessonIds[0], "Something", NOW);

    saveNote(db, base.user.id, lessonIds[0], "   ", minutesAfter(1));

    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
  });

  it("never leaves a Student with two Notes on one Lesson", () => {
    saveNote(db, base.user.id, lessonIds[0], "Mine", NOW);

    expect(() =>
      db
        .insert(schema.notes)
        .values({ userId: base.user.id, lessonId: lessonIds[0], body: "Again" })
        .run()
    ).toThrow();
  });
});

describe("listing a Student's Notes", () => {
  it("lists only that Student's Notes, last edited first, with Lesson and Course", () => {
    const other = db
      .insert(schema.users)
      .values({ name: "Ben", email: "ben@example.com", role: UserRole.Student })
      .returning()
      .get();
    saveNote(db, base.user.id, lessonIds[0], "Older", NOW);
    saveNote(db, base.user.id, lessonIds[1], "Newer", minutesAfter(5));
    saveNote(db, other.id, lessonIds[0], "Ben's", minutesAfter(10));

    expect(listNotesForStudent(db, base.user.id)).toMatchObject([
      {
        body: "Newer",
        lessonId: lessonIds[1],
        lessonTitle: "Lesson 2",
        courseTitle: base.course.title,
        courseSlug: base.course.slug,
      },
      { body: "Older", lessonId: lessonIds[0] },
    ]);
  });
});
