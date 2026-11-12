// PROTOTYPE — throwaway, for "Bell and unread/read behaviour" (issue #26, map #23).
// Three variants of the Notification bell mounted in the real sidebar,
// switchable via `?variant=A|B|C`. Notifications are hard-coded fixtures held in
// memory (no DB, no polling): reload to reset. Lives on prototype/* only.
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { Popover } from "radix-ui";
import { Bell, Check, CheckCheck, Circle, X } from "lucide-react";
import { cn } from "~/lib/utils";
import { UserRole } from "~/db/schema";
import {
  PrototypeSwitcher,
  usePrototypeVariant,
} from "~/components/prototype-switcher";

type Kind = "question" | "reply";

interface ProtoNotification {
  id: number;
  kind: Kind;
  actor: string;
  // the top-level Comment the thread hangs off
  threadId: number;
  threadSnippet: string;
  threadAuthorIsYou: boolean;
  commentId: number;
  excerpt: string;
  courseSlug: string;
  courseTitle: string;
  lessonId: number;
  lessonTitle: string;
  minutesAgo: number;
  read: boolean;
}

const TS = {
  courseSlug: "introduction-to-typescript",
  courseTitle: "Introduction to TypeScript",
};

// Seen as Emma Wilson (Student, Thread Participant).
const studentFixtures: ProtoNotification[] = [
  { id: 1, kind: "reply", actor: "Sarah Chen", threadId: 1, threadSnippet: "I'm getting `tsc: command not found`…", threadAuthorIsYou: true, commentId: 101, excerpt: "Did `npx tsc --version` work? If so it's a PATH thing.", ...TS, lessonId: 3, lessonTitle: "Your First TypeScript Program", minutesAgo: 2, read: false },
  { id: 2, kind: "reply", actor: "James Park", threadId: 1, threadSnippet: "I'm getting `tsc: command not found`…", threadAuthorIsYou: true, commentId: 102, excerpt: "Same here on Windows — npx fixed it for me too.", ...TS, lessonId: 3, lessonTitle: "Your First TypeScript Program", minutesAgo: 6, read: false },
  { id: 3, kind: "reply", actor: "Olivia Martinez", threadId: 1, threadSnippet: "I'm getting `tsc: command not found`…", threadAuthorIsYou: true, commentId: 103, excerpt: "Are you using nvm? That bit me last week.", ...TS, lessonId: 3, lessonTitle: "Your First TypeScript Program", minutesAgo: 14, read: false },
  { id: 4, kind: "reply", actor: "Sarah Chen", threadId: 6, threadSnippet: "Does strict mode change anything about…", threadAuthorIsYou: false, commentId: 104, excerpt: "Good instinct — it's `strictNullChecks` doing the work here.", ...TS, lessonId: 4, lessonTitle: "Primitive Types", minutesAgo: 180, read: false },
  { id: 5, kind: "reply", actor: "James Park", threadId: 6, threadSnippet: "Does strict mode change anything about…", threadAuthorIsYou: false, commentId: 105, excerpt: "Thanks both, that clears it up.", ...TS, lessonId: 4, lessonTitle: "Primitive Types", minutesAgo: 60 * 26, read: true },
  { id: 6, kind: "reply", actor: "Sarah Chen", threadId: 1, threadSnippet: "I'm getting `tsc: command not found`…", threadAuthorIsYou: true, commentId: 2, excerpt: "That usually means TypeScript is installed locally…", ...TS, lessonId: 3, lessonTitle: "Your First TypeScript Program", minutesAgo: 60 * 24 * 4, read: true },
];

// Seen as Sarah Chen (Instructor): Questions on her course, plus Replies in
// threads she's taken part in.
const instructorFixtures: ProtoNotification[] = [
  { id: 11, kind: "question", actor: "Olivia Martinez", threadId: 4, threadSnippet: "Why does this fail to infer? I expected `T`…", threadAuthorIsYou: false, commentId: 4, excerpt: "Why does this fail to infer? I expected `T` to come from the argument.", ...TS, lessonId: 8, lessonTitle: "Function Types", minutesAgo: 3, read: false },
  { id: 12, kind: "reply", actor: "Emma Wilson", threadId: 1, threadSnippet: "I'm getting `tsc: command not found`…", threadAuthorIsYou: false, commentId: 3, excerpt: "`npx` did it. Thank you!", ...TS, lessonId: 3, lessonTitle: "Your First TypeScript Program", minutesAgo: 9, read: false },
  { id: 13, kind: "reply", actor: "James Park", threadId: 1, threadSnippet: "I'm getting `tsc: command not found`…", threadAuthorIsYou: false, commentId: 102, excerpt: "Same here on Windows — npx fixed it for me too.", ...TS, lessonId: 3, lessonTitle: "Your First TypeScript Program", minutesAgo: 12, read: false },
  { id: 14, kind: "question", actor: "Sophia Davis", threadId: 5, threadSnippet: "Is there a reason to prefer `interface`…", threadAuthorIsYou: false, commentId: 5, excerpt: "Is there a reason to prefer `interface` over `type` here?", ...TS, lessonId: 5, lessonTitle: "Arrays and Tuples", minutesAgo: 95, read: false },
  { id: 15, kind: "question", actor: "James Park", threadId: 6, threadSnippet: "Does strict mode change anything about…", threadAuthorIsYou: false, commentId: 6, excerpt: "Does strict mode change anything about how this example behaves?", ...TS, lessonId: 4, lessonTitle: "Primitive Types", minutesAgo: 60 * 30, read: true },
];

function fixturesFor(role: UserRole | null) {
  return role === UserRole.Instructor || role === UserRole.Admin
    ? instructorFixtures
    : studentFixtures;
}

function lessonHref(n: ProtoNotification) {
  // NB: comment-thread.tsx has no #comment-<id> anchors yet.
  return `/courses/${n.courseSlug}/lessons/${n.lessonId}#comment-${n.commentId}`;
}

function ago(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 60 / 24)}d`;
}

function title(n: ProtoNotification) {
  if (n.kind === "question") return `${n.actor} asked a Question`;
  return n.threadAuthorIsYou
    ? `${n.actor} replied to your Comment`
    : `${n.actor} replied in a thread you're in`;
}

function useProtoState(role: UserRole | null) {
  const [items, setItems] = useState(() => fixturesFor(role));
  // B only: the bell badge counts Notifications newer than the last time you opened it.
  const [seenMaxId, setSeenMaxId] = useState(0);
  useEffect(() => {
    setItems(fixturesFor(role));
    setSeenMaxId(0);
  }, [role]);

  const setRead = (ids: number[], read: boolean) =>
    setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read } : n)));

  return {
    items,
    unread: items.filter((n) => !n.read).length,
    unseen: items.filter((n) => !n.read && n.id > seenMaxId).length,
    markSeen: () => setSeenMaxId(Math.max(...items.map((n) => n.id))),
    // Stand-in for the 30s poll returning something new.
    simulateArrival: () =>
      setItems((prev) => {
        const id = Math.max(...prev.map((n) => n.id)) + 1;
        const base = prev.find((n) => n.kind === "reply") ?? prev[0];
        return [
          { ...base, id, kind: "reply", actor: "Liam Thompson", commentId: 900 + id, excerpt: `New Reply #${id} just arrived.`, minutesAgo: 0, read: false },
          ...prev.map((n) => ({ ...n, minutesAgo: n.minutesAgo + 1 })),
        ];
      }),
    setRead,
    markAllRead: () => setItems((prev) => prev.map((n) => ({ ...n, read: true }))),
  };
}

type ProtoState = ReturnType<typeof useProtoState>;

function Badge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

// ─── Variant A: popover, one row per Notification, click to read ───────────

function VariantA({ s }: { s: ProtoState }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent">
        <Bell className="size-4" />
        <Badge count={s.unread} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="start"
          sideOffset={8}
          className="z-50 w-96 rounded-lg border bg-popover text-popover-foreground shadow-xl"
        >
          <div className="flex items-center justify-between border-b px-4 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            <button
              onClick={s.markAllRead}
              disabled={s.unread === 0}
              className="flex items-center gap-1 text-xs text-primary disabled:opacity-40"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          </div>
          <ul className="max-h-[28rem] overflow-y-auto">
            {s.items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => {
                    s.setRead([n.id], true);
                    setOpen(false);
                    navigate(lessonHref(n));
                  }}
                  className={cn(
                    "flex w-full gap-3 border-b px-4 py-3 text-left hover:bg-accent",
                    !n.read && "bg-primary/5"
                  )}
                >
                  <span className="mt-1.5 w-2 shrink-0">
                    {!n.read && <Circle className="size-2 fill-primary text-primary" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", !n.read && "font-semibold")}>
                      {title(n)}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      “{n.excerpt}”
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {n.lessonTitle} · {ago(n.minutesAgo)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ─── Variant B: popover grouped by thread, badge clears on open ────────────

function VariantB({ s }: { s: ProtoState }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => {
    const byThread = new Map<string, ProtoNotification[]>();
    for (const n of s.items) {
      const key = `${n.kind}-${n.threadId}`;
      byThread.set(key, [...(byThread.get(key) ?? []), n]);
    }
    return [...byThread.values()].sort((a, b) => a[0].minutesAgo - b[0].minutesAgo);
  }, [s.items]);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) s.markSeen();
      }}
    >
      <Popover.Trigger className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent">
        <Bell className="size-4" />
        <Badge count={s.unseen} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="start"
          sideOffset={8}
          className="z-50 w-96 rounded-lg border bg-popover text-popover-foreground shadow-xl"
        >
          <div className="flex items-center justify-between border-b px-4 py-2">
            <span className="text-sm font-semibold">
              Notifications{" "}
              <span className="font-normal text-muted-foreground">({s.unread} unread)</span>
            </span>
            <button
              onClick={s.markAllRead}
              disabled={s.unread === 0}
              className="text-xs text-primary disabled:opacity-40"
            >
              Mark all read
            </button>
          </div>
          <ul className="max-h-[28rem] overflow-y-auto p-2">
            {groups.map((g) => {
              const unread = g.filter((n) => !n.read);
              const actors = [...new Set(g.map((n) => n.actor))];
              const head = g[0];
              const who =
                actors.length === 1
                  ? actors[0]
                  : `${actors[0]} and ${actors.length - 1} other${actors.length > 2 ? "s" : ""}`;
              const target = unread.at(-1) ?? head; // oldest unread first
              return (
                <li key={`${head.kind}-${head.threadId}`}>
                  <button
                    onClick={() => {
                      s.setRead(g.map((n) => n.id), true);
                      setOpen(false);
                      navigate(lessonHref(target));
                    }}
                    className={cn(
                      "w-full rounded-md p-3 text-left hover:bg-accent",
                      unread.length > 0 ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn("text-sm", unread.length > 0 && "font-semibold")}>
                        {head.kind === "question" ? `${who} asked a Question` : `${who} replied`}
                      </span>
                      <span className="shrink-0 text-xs">{ago(head.minutesAgo)}</span>
                    </div>
                    <div className="truncate text-sm">on “{head.threadSnippet}”</div>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      {unread.length > 1 && (
                        <span className="rounded bg-primary px-1.5 py-0.5 font-medium text-primary-foreground">
                          {unread.length} new
                        </span>
                      )}
                      <span className="text-muted-foreground">{head.lessonTitle}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ─── Variant C: nav item + inbox drawer, read on visiting the lesson ───────

function VariantCNav({ s, onOpen }: { s: ProtoState; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <Bell className="size-4" />
      Notifications
      {s.unread > 0 && (
        <span className="ml-auto rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
          {s.unread}
        </span>
      )}
    </button>
  );
}

function VariantCDrawer({
  s,
  open,
  onClose,
}: {
  s: ProtoState;
  open: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"unread" | "all">("unread");
  const shown = s.items.filter((n) => tab === "all" || !n.read);
  const buckets: [string, ProtoNotification[]][] = [
    ["Today", shown.filter((n) => n.minutesAgo < 60 * 24)],
    ["Yesterday", shown.filter((n) => n.minutesAgo >= 60 * 24 && n.minutesAgo < 60 * 48)],
    ["Earlier", shown.filter((n) => n.minutesAgo >= 60 * 48)],
  ];
  if (!open) return null;
  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-[26rem] flex-col border-l bg-background shadow-2xl">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="font-semibold">Notifications</span>
        <div className="flex items-center gap-2">
          <button onClick={s.markAllRead} className="text-xs text-primary">
            Mark all read
          </button>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>
      </div>
      <div className="flex gap-1 border-b px-4 py-2 text-sm">
        {(["unread", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-3 py-1 capitalize",
              tab === t ? "bg-accent font-medium" : "text-muted-foreground"
            )}
          >
            {t} {t === "unread" && `(${s.unread})`}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {shown.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">You're all caught up.</p>
        )}
        {buckets
          .filter(([, list]) => list.length > 0)
          .map(([label, list]) => (
            <section key={label}>
              <h3 className="bg-muted/50 px-4 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
              </h3>
              {list.map((n) => (
                <div key={n.id} className="group flex items-start gap-3 border-b px-4 py-3">
                  <Link
                    to={n.kind === "question" ? "/instructor/questions" : lessonHref(n)}
                    onClick={onClose}
                    className="min-w-0 flex-1"
                  >
                    <div className={cn("text-sm", !n.read && "font-semibold")}>{title(n)}</div>
                    <div className="truncate text-sm text-muted-foreground">“{n.excerpt}”</div>
                    <div className="text-xs text-muted-foreground">
                      {n.courseTitle} › {n.lessonTitle} · {ago(n.minutesAgo)}
                      {n.kind === "question" && " · opens Questions queue"}
                    </div>
                  </Link>
                  <button
                    title={n.read ? "Mark unread" : "Mark read"}
                    onClick={() => s.setRead([n.id], !n.read)}
                    className="rounded p-1 text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100"
                  >
                    {n.read ? <Circle className="size-3.5" /> : <Check className="size-3.5" />}
                  </button>
                </div>
              ))}
            </section>
          ))}
      </div>
    </div>
  );
}

// ─── Wiring ────────────────────────────────────────────────────────────────

const VARIANTS = [
  { key: "A", name: "Popover · one per Reply · click to read" },
  { key: "B", name: "Popover · grouped by thread · badge clears on open" },
  { key: "C", name: "Inbox drawer · read on visiting the lesson" },
];

export function useNotificationsPrototype(role: UserRole | null) {
  const variant = usePrototypeVariant(VARIANTS.map((v) => v.key));
  const s = useProtoState(role);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // C: landing on a lesson marks every Notification pointing at it read.
  useEffect(() => {
    if (variant !== "C") return;
    const m = location.pathname.match(/^\/courses\/[^/]+\/lessons\/(\d+)/);
    if (!m) return;
    const lessonId = Number(m[1]);
    s.setRead(
      s.items.filter((n) => n.lessonId === lessonId && n.kind === "reply").map((n) => n.id),
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, variant]);

  return {
    header:
      variant === "A" ? <VariantA s={s} /> : variant === "B" ? <VariantB s={s} /> : null,
    nav: variant === "C" ? <VariantCNav s={s} onOpen={() => setDrawerOpen(true)} /> : null,
    overlay: (
      <>
        {variant === "C" && (
          <VariantCDrawer s={s} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        )}
        <div className="fixed bottom-16 left-1/2 z-[60] -translate-x-1/2 rounded-md bg-black/80 px-3 py-1 font-mono text-[11px] text-white">
          unread={s.unread}
          {variant === "B" && ` unseen=${s.unseen}`} · read=[
          {s.items.filter((n) => n.read).map((n) => n.id).join(",")}]{" "}
          <button onClick={s.simulateArrival} className="ml-2 underline">
            + simulate new Reply
          </button>
        </div>
        <PrototypeSwitcher variants={VARIANTS} current={variant} />
      </>
    ),
  };
}
