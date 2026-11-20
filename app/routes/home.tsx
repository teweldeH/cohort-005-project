import { Link } from "react-router";
import { useState, useEffect, type ReactNode } from "react";
import type { Route } from "./+types/home";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "~/components/ui/card";
import {
  BookOpen,
  GraduationCap,
  Users,
  ArrowRight,
  User,
  Moon,
  Sun,
  Sparkles,
} from "lucide-react";
import { CourseImage } from "~/components/course-image";
import { DevUI } from "~/components/dev-ui";
import { getCurrentUserId, getDevCountry } from "~/lib/session";
import { getCountryTierInfo, COUNTRIES } from "~/lib/ppp";
import { eq } from "drizzle-orm";
import { db } from "~/db";
import { users } from "~/db/schema";
import {
  landingPage,
  type FeaturedCourse,
} from "~/modules/landing-page/index.server";

// The accent is scoped to this page on purpose: the app.css tokens are shared
// by every shadcn component, so a brand colour there is its own decision.
const accentText =
  "bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent dark:from-indigo-400 dark:to-fuchsia-400";
const accentButton =
  "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-500 hover:to-violet-500";

type CurrentUser = { id: number; name: string; role: string } | null;

export function meta() {
  return [
    { title: "Cadence — Learn at your own pace" },
    {
      name: "description",
      content:
        "A modern course platform for developers. Browse courses, track your progress, and learn at your own pace.",
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const allUsers = db.select().from(users).all();
  const currentUserId = await getCurrentUserId(request);
  const currentUser = currentUserId
    ? db.select().from(users).where(eq(users.id, currentUserId)).get()
    : null;
  const devCountry = await getDevCountry(request);

  return {
    ...(await landingPage.get()),
    year: new Date().getFullYear(),
    users: allUsers.map((u) => ({ id: u.id, name: u.name, role: u.role })),
    currentUser: currentUser
      ? { id: currentUser.id, name: currentUser.name, role: currentUser.role }
      : null,
    devCountry,
    countryTierInfo: getCountryTierInfo(devCountry),
    countries: COUNTRIES,
  };
}

function useDarkMode() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("cadence-theme", next ? "dark" : "light");
    } catch {}
  }

  return { isDark, toggle };
}

function Logo() {
  return (
    <Link
      to="/"
      className="flex items-center gap-2 text-xl font-bold tracking-tight"
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white">
        <GraduationCap className="size-5" />
      </span>
      Cadence
    </Link>
  );
}

const navLink =
  "text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";

function Header({ currentUser }: { currentUser: CurrentUser }) {
  const { isDark, toggle } = useDarkMode();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-3 sm:gap-6">
          <Link to="/courses" className={navLink}>
            Courses
          </Link>
          <button
            onClick={toggle}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground"
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          {currentUser ? (
            <Button asChild size="sm">
              <Link to="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Link to="/login" className={navLink}>
                Log In
              </Link>
              <Button asChild size="sm">
                <Link to="/signup">Sign Up</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute -top-40 left-1/2 h-[32rem] w-[56rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-400/30 via-violet-400/30 to-fuchsia-400/30 blur-3xl dark:from-indigo-600/25 dark:via-violet-600/25 dark:to-fuchsia-600/20" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgb(148_163_184/0.3)_1px,transparent_0)] [background-size:24px_24px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
    </div>
  );
}

function Hero({
  currentUser,
  totalCourses,
}: {
  currentUser: CurrentUser;
  totalCourses: number;
}) {
  return (
    <section className="relative isolate overflow-hidden">
      <HeroBackdrop />
      <div className="mx-auto max-w-6xl px-6 pt-24 pb-28 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/70 px-4 py-1.5 text-sm font-medium text-indigo-700 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
          <Sparkles className="size-4" />
          {totalCourses} courses from working instructors
        </span>
        <h1 className="mt-8 text-5xl font-extrabold tracking-tight sm:text-7xl">
          Learn to code,
          <br />
          <span className={accentText}>at your own pace</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-foreground/80 sm:text-xl">
          Structured courses built by experienced instructors. Track your
          progress, take quizzes, and build real-world skills.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Button asChild size="lg" className={accentButton}>
            <Link to="/courses">
              Browse Courses
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="bg-background/70"
          >
            {currentUser ? (
              <Link to="/dashboard">Go to Dashboard</Link>
            ) : (
              <Link to="/signup">Create a free account</Link>
            )}
          </Button>
        </div>
      </div>
    </section>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
        {icon}
      </div>
      <div>
        <p className="text-3xl font-bold tracking-tight">
          {value.toLocaleString("en-US")}
        </p>
        <p className="text-sm font-medium text-foreground/70">{label}</p>
      </div>
    </div>
  );
}

function Stats(props: {
  totalCourses: number;
  totalCategories: number;
  totalEnrollments: number;
}) {
  return (
    <section className="mx-auto -mt-12 grid max-w-6xl grid-cols-1 gap-6 px-6 sm:grid-cols-3">
      <Stat
        icon={<BookOpen className="size-6" />}
        value={props.totalCourses}
        label="Available courses"
      />
      <Stat
        icon={<GraduationCap className="size-6" />}
        value={props.totalCategories}
        label="Categories"
      />
      <Stat
        icon={<Users className="size-6" />}
        value={props.totalEnrollments}
        label="Enrollments"
      />
    </section>
  );
}

function CourseCard({ course }: { course: FeaturedCourse }) {
  return (
    <Link to={`/courses/${course.slug}`} className="group">
      <Card className="h-full overflow-hidden pt-0 transition-all group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-indigo-500/10">
        <div className="relative">
          <CourseImage
            src={course.coverImageUrl}
            alt={course.title}
            className="aspect-video w-full object-cover"
          />
          <span className="absolute top-3 left-3 rounded-full bg-background/90 px-3 py-1 text-xs font-semibold shadow-sm">
            {course.categoryName}
          </span>
        </div>
        <CardHeader>
          <h3 className="text-lg font-semibold leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
            {course.title}
          </h3>
        </CardHeader>
        <CardContent>
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {course.description}
          </p>
        </CardContent>
        <CardFooter className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="size-3" />
            {course.instructorName}
          </span>
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Users className="size-3" />
              {course.enrollmentCount} enrolled
            </span>
            <span className="flex items-center gap-1">
              <BookOpen className="size-3" />
              {course.lessonCount} lessons
            </span>
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
}

function FeaturedCourses({ courses }: { courses: FeaturedCourse[] }) {
  if (courses.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-wider text-indigo-600 uppercase dark:text-indigo-400">
            Featured
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Most popular courses
          </h2>
          <p className="mt-2 text-foreground/70">
            Start with the courses learners enroll in most.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/courses">
            View all
            <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((course) => (
          <CourseCard key={course.id} course={course} />
        ))}
      </div>
    </section>
  );
}

function Footer({
  currentUser,
  year,
}: {
  currentUser: CurrentUser;
  year: number;
}) {
  return (
    <footer className="border-t border-border bg-muted/40">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Logo />
          <p className="mt-2 text-sm text-muted-foreground">
            Learn to code, at your own pace.
          </p>
        </div>
        <nav className="flex flex-wrap gap-6">
          <Link to="/courses" className={navLink}>
            Courses
          </Link>
          {currentUser ? (
            <Link to="/dashboard" className={navLink}>
              Dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className={navLink}>
                Log In
              </Link>
              <Link to="/signup" className={navLink}>
                Sign Up
              </Link>
            </>
          )}
        </nav>
      </div>
      <div className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        © {year} Cadence. All rights reserved.
      </div>
    </footer>
  );
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { currentUser } = loaderData;

  return (
    <div className="min-h-screen bg-background">
      <Header currentUser={currentUser} />
      <Hero currentUser={currentUser} totalCourses={loaderData.totalCourses} />
      <Stats
        totalCourses={loaderData.totalCourses}
        totalCategories={loaderData.totalCategories}
        totalEnrollments={loaderData.totalEnrollments}
      />
      <FeaturedCourses courses={loaderData.featuredCourses} />
      <Footer currentUser={currentUser} year={loaderData.year} />
      <DevUI
        users={loaderData.users}
        currentUser={currentUser}
        devCountry={loaderData.devCountry}
        countryTierInfo={loaderData.countryTierInfo}
        countries={loaderData.countries}
      />
    </div>
  );
}
