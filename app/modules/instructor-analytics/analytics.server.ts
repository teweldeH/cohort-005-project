// ─── Instructor Analytics: server entry point ───
// The figures behind the instructor analytics page, one call per tab, run
// against the app database unless a caller passes another (tests do).
export {
  getAnalyticsOverview,
  getCourseAnalytics,
  listAnalyticsInstructors,
} from "./lib/service.server";

export type {
  AnalyticsOverview,
  AnalyticsScope,
  CourseAnalytics,
  CourseCountryRevenue,
  CourseFunnel,
  CourseProgressSummary,
  FunnelLesson,
  QuizPassRate,
  RevenueSeries,
} from "./lib/service.server";
