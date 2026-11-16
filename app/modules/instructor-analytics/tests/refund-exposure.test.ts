import { describe, it, expect } from "vitest";
import { computeRefundExposure } from "../refund-exposure";

const NOW = new Date(2026, 9, 20, 12, 0, 0);

function daysBefore(days: number, hour = 12) {
  const when = new Date(NOW);
  when.setDate(when.getDate() - days);
  when.setHours(hour);
  return when.toISOString();
}

function purchase(
  daysAgo: number,
  amountPaid = 1000,
  course = { courseId: 1, title: "Course One" }
) {
  return { ...course, amountPaid, createdAt: daysBefore(daysAgo) };
}

describe("computeRefundExposure", () => {
  it("counts a purchase on its fourteenth day but not its fifteenth", () => {
    const exposure = computeRefundExposure(
      [purchase(14, 1000), purchase(15, 5000)],
      6000,
      NOW
    );

    expect(exposure.grossCents).toBe(1000);
    expect(exposure.purchaseCount).toBe(1);
  });

  it("gives the fourteenth day zero days left and counts it as closing today", () => {
    const exposure = computeRefundExposure(
      [purchase(14), purchase(14), purchase(12)],
      3000,
      NOW
    );

    expect(exposure.closingTodayCount).toBe(2);
    expect(exposure.courses[0].daysLeft).toBe(0);
  });

  it("counts the window in calendar days, not 24-hour periods", () => {
    // Bought at 09:00 fourteen days ago and checked at noon: a rolling 14 × 24
    // hours closed three hours ago, but the fourteenth day isn't over yet.
    const morning = {
      courseId: 1,
      title: "Course One",
      amountPaid: 1000,
      createdAt: daysBefore(14, 9),
    };

    expect(computeRefundExposure([morning], 1000, NOW).purchaseCount).toBe(1);
  });

  it("headlines each course with its soonest-closing purchase", () => {
    const exposure = computeRefundExposure(
      [purchase(2), purchase(10), purchase(5)],
      3000,
      NOW
    );

    expect(exposure.courses).toEqual([
      {
        courseId: 1,
        title: "Course One",
        grossCents: 3000,
        purchaseCount: 3,
        daysLeft: 4,
      },
    ]);
  });

  it("lists courses biggest exposure first, and splits the fee off the total", () => {
    const small = { courseId: 1, title: "Small" };
    const big = { courseId: 2, title: "Big" };

    const exposure = computeRefundExposure(
      [purchase(1, 1000, small), purchase(1, 4000, big)],
      10000,
      NOW
    );

    expect(exposure.courses.map((course) => course.title)).toEqual([
      "Big",
      "Small",
    ]);
    expect(exposure.grossCents).toBe(5000);
    expect(exposure.netCents).toBe(4000);
    expect(exposure.sharePercent).toBe(50);
  });

  it("reports a zero share rather than dividing by zero gross revenue", () => {
    const exposure = computeRefundExposure([purchase(1, 0)], 0, NOW);

    expect(exposure.sharePercent).toBe(0);
    expect(exposure.purchaseCount).toBe(1);
  });

  it("reports nothing exposed when every window has closed", () => {
    expect(
      computeRefundExposure([purchase(15), purchase(40)], 2000, NOW)
    ).toEqual({
      grossCents: 0,
      netCents: 0,
      purchaseCount: 0,
      sharePercent: 0,
      closingTodayCount: 0,
      courses: [],
    });
  });
});
