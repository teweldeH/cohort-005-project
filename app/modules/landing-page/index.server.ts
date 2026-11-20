import { db } from "~/db";
import { getLandingPage, type Db, type LandingPage } from "./lib/landing-page";

export type { FeaturedCourse, LandingPage } from "./lib/landing-page";
export { FEATURED_COURSE_LIMIT } from "./lib/landing-page";

/**
 * The landing page's data bound to a database. The app uses `landingPage`,
 * which reads the app database; tests build their own against a test
 * database.
 */
export function createLandingPage(database: Db) {
  return {
    /**
     * The figures and featured courses on `/`. Only published courses count.
     * Featured courses are the most enrolled; a tie goes to the newer course.
     */
    get(): Promise<LandingPage> {
      return getLandingPage(database);
    },
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const landingPage = /* @__PURE__ */ createLandingPage(db);
