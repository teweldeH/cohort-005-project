import { describe, it, expect, beforeEach } from "vitest";
import { UserRole } from "~/db/schema";
import { mayManageCourse, mayTakeCourse } from "../permissions.server";
import { createWorld, type World } from "./fixtures";

let world: World;

beforeEach(() => {
  world = createWorld();
});

const ALLOWED = { allowed: true };

function denied(reason: object) {
  return { allowed: false, reason };
}

function viewer(userId: number, country: string | null = null) {
  return { userId, country };
}

describe("take the course", () => {
  it("denies a signed-out viewer", () => {
    expect(mayTakeCourse(null, world.course.id, world.db)).toEqual(
      denied({ kind: "signed-out" })
    );
  });

  it("treats a session for a deleted user as signed out", () => {
    const gone = world.addUser(UserRole.Student);
    world.deleteUser(gone.id);

    expect(mayTakeCourse(viewer(gone.id), world.course.id, world.db)).toEqual(
      denied({ kind: "signed-out" })
    );
  });

  it("denies a course that doesn't exist", () => {
    expect(mayTakeCourse(viewer(world.user.id), 9999, world.db)).toEqual(
      denied({ kind: "course-not-found" })
    );
  });

  it("denies a Student with no Enrollment", () => {
    expect(
      mayTakeCourse(viewer(world.user.id), world.course.id, world.db)
    ).toEqual(denied({ kind: "no-enrollment" }));
  });

  it("allows a Student with an Enrollment", () => {
    world.enrol(world.user.id, world.course.id);

    expect(
      mayTakeCourse(viewer(world.user.id), world.course.id, world.db)
    ).toEqual(ALLOWED);
  });

  describe("purchase country", () => {
    function discountedCourse() {
      return world.addCourse(world.instructor.id, {
        price: 10000,
        pppEnabled: true,
      });
    }

    it("denies a Student outside the country of a discounted Purchase, with both codes", () => {
      const course = discountedCourse();
      world.buy(world.user.id, course.id, "IN");

      expect(
        mayTakeCourse(viewer(world.user.id, "US"), course.id, world.db)
      ).toEqual(
        denied({
          kind: "outside-purchase-country",
          purchaseCountry: "IN",
          currentCountry: "US",
        })
      );
    });

    it("allows the Student inside the purchase country", () => {
      const course = discountedCourse();
      world.buy(world.user.id, course.id, "IN");

      expect(
        mayTakeCourse(viewer(world.user.id, "IN"), course.id, world.db)
      ).toEqual(ALLOWED);
    });

    it("allows a Student who bought at full price, from anywhere", () => {
      const course = discountedCourse();
      world.buy(world.user.id, course.id, "US");

      expect(
        mayTakeCourse(viewer(world.user.id, "IN"), course.id, world.db)
      ).toEqual(ALLOWED);
    });

    it("allows a Student on a free course, from anywhere", () => {
      const course = world.addCourse(world.instructor.id, { price: 0 });
      world.buy(world.user.id, course.id, "IN");

      expect(
        mayTakeCourse(viewer(world.user.id, "US"), course.id, world.db)
      ).toEqual(ALLOWED);
    });

    it("allows a Student when the discount is off for the course", () => {
      const course = world.addCourse(world.instructor.id, {
        price: 10000,
        pppEnabled: false,
      });
      world.buy(world.user.id, course.id, "IN");

      expect(
        mayTakeCourse(viewer(world.user.id, "US"), course.id, world.db)
      ).toEqual(ALLOWED);
    });

    it("allows a Student when the current country is unknown (ADR-0012)", () => {
      const course = discountedCourse();
      world.buy(world.user.id, course.id, "IN");

      expect(
        mayTakeCourse(viewer(world.user.id, null), course.id, world.db)
      ).toEqual(ALLOWED);
    });

    it("exempts the owning Instructor and Platform Admins", () => {
      const course = discountedCourse();
      const admin = world.addUser(UserRole.Admin);
      world.buy(world.instructor.id, course.id, "IN");
      world.buy(admin.id, course.id, "IN");

      expect(
        mayTakeCourse(viewer(world.instructor.id, "US"), course.id, world.db)
      ).toEqual(ALLOWED);
      expect(
        mayTakeCourse(viewer(admin.id, "US"), course.id, world.db)
      ).toEqual(ALLOWED);
    });
  });

  it("allows the owning Instructor without an Enrollment", () => {
    expect(
      mayTakeCourse(viewer(world.instructor.id), world.course.id, world.db)
    ).toEqual(ALLOWED);
  });

  it("allows a Platform Admin without an Enrollment", () => {
    const admin = world.addUser(UserRole.Admin);

    expect(mayTakeCourse(viewer(admin.id), world.course.id, world.db)).toEqual(
      ALLOWED
    );
  });
});

describe("manage the course", () => {
  it("denies a signed-out viewer", () => {
    expect(mayManageCourse(null, world.course.id, world.db)).toEqual(
      denied({ kind: "signed-out" })
    );
  });

  it("denies a course that doesn't exist", () => {
    expect(
      mayManageCourse(viewer(world.instructor.id), 9999, world.db)
    ).toEqual(denied({ kind: "course-not-found" }));
  });

  it("allows the owning Instructor", () => {
    expect(
      mayManageCourse(viewer(world.instructor.id), world.course.id, world.db)
    ).toEqual(ALLOWED);
  });

  it("denies another Instructor", () => {
    const other = world.addUser(UserRole.Instructor);

    expect(
      mayManageCourse(viewer(other.id), world.course.id, world.db)
    ).toEqual(denied({ kind: "not-course-manager" }));
  });

  it("allows a Platform Admin", () => {
    const admin = world.addUser(UserRole.Admin);

    expect(
      mayManageCourse(viewer(admin.id), world.course.id, world.db)
    ).toEqual(ALLOWED);
  });

  it("denies a Student, even with an Enrollment", () => {
    world.enrol(world.user.id, world.course.id);

    expect(
      mayManageCourse(viewer(world.user.id), world.course.id, world.db)
    ).toEqual(denied({ kind: "not-course-manager" }));
  });
});
