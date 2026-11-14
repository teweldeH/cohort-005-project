// MOCK — Notifications v1 (#38, #45) is a clickable mock, not a real system.
// Notifications are hard-coded per seed user and read state lives in a
// module-level store: it survives client-side navigation and resets on reload.
// No database, no polling, no email.
import { useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router";
import { Popover } from "radix-ui";
import { Bell, CheckCheck, Circle, CircleDot } from "lucide-react";
import { cn } from "~/lib/utils";

type MockNotification = { id: number; minutesAgo: number; read: boolean } & (
  | {
      kind: "question" | "reply";
      actor: string;
      // Reply only: whether the recipient started the thread
      onYourQuestion?: boolean;
      courseSlug: string;
      lessonId: number;
      lessonTitle: string;
      commentId: number;
    }
  | {
      kind: "refund_request_decided";
      decision: "Approved" | "Declined";
      courseSlug: string;
      courseTitle: string;
      teamPurchase: boolean;
    }
  | { kind: "seat_claimed"; actor: string; courseTitle: string }
);

const TS = "introduction-to-typescript";
const API = "building-rest-apis-with-nodejs";

// Keyed by seed user id. Comment, lesson and course ids match the seed so
// links land on real pages. Admins (and anyone missing here) get nothing.
const MOCK_NOTIFICATIONS: Record<number, MockNotification[]> = {
  // Sarah Chen, Instructor of Introduction to TypeScript
  2: [
    { id: 201, kind: "reply", actor: "Emma Wilson", courseSlug: TS, lessonId: 3, lessonTitle: "Your First TypeScript Program", commentId: 3, minutesAgo: 4, read: false },
    { id: 202, kind: "question", actor: "Olivia Martinez", courseSlug: TS, lessonId: 8, lessonTitle: "Function Types", commentId: 4, minutesAgo: 35, read: false },
    { id: 203, kind: "question", actor: "Sophia Davis", courseSlug: TS, lessonId: 5, lessonTitle: "Arrays and Tuples", commentId: 5, minutesAgo: 60 * 5, read: false },
    { id: 204, kind: "question", actor: "James Park", courseSlug: TS, lessonId: 4, lessonTitle: "Primitive Types", commentId: 6, minutesAgo: 60 * 30, read: true },
    { id: 205, kind: "question", actor: "James Park", courseSlug: TS, lessonId: 1, lessonTitle: "What is TypeScript?", commentId: 8, minutesAgo: 60 * 24 * 4, read: true },
  ],
  // Marcus Johnson, Instructor of Building REST APIs with Node.js
  3: [
    { id: 301, kind: "question", actor: "Liam Thompson", courseSlug: API, lessonId: 22, lessonTitle: "HTTP Methods and Status Codes", commentId: 12, minutesAgo: 20, read: false },
    { id: 302, kind: "question", actor: "Olivia Martinez", courseSlug: API, lessonId: 20, lessonTitle: "What is a REST API?", commentId: 13, minutesAgo: 60 * 26, read: true },
  ],
  // Emma Wilson, Student, and the Buyer behind a declined Refund Request
  5: [
    { id: 501, kind: "reply", actor: "Sarah Chen", onYourQuestion: true, courseSlug: TS, lessonId: 3, lessonTitle: "Your First TypeScript Program", commentId: 2, minutesAgo: 12, read: false },
    { id: 502, kind: "refund_request_decided", decision: "Declined", courseSlug: API, courseTitle: "Building REST APIs with Node.js", teamPurchase: false, minutesAgo: 60 * 24 * 36, read: true },
  ],
  // James Park, Student
  6: [
    { id: 601, kind: "reply", actor: "Emma Wilson", onYourQuestion: true, courseSlug: TS, lessonId: 4, lessonTitle: "Primitive Types", commentId: 7, minutesAgo: 8, read: false },
    { id: 602, kind: "reply", actor: "Sarah Chen", onYourQuestion: true, courseSlug: TS, lessonId: 1, lessonTitle: "What is TypeScript?", commentId: 9, minutesAgo: 60 * 24 * 3, read: true },
  ],
  // Olivia Martinez, Student
  7: [
    { id: 701, kind: "reply", actor: "Alex Rivera", onYourQuestion: true, courseSlug: API, lessonId: 20, lessonTitle: "What is a REST API?", commentId: 14, minutesAgo: 60 * 2, read: false },
  ],
  // Bossy McBossface, Buyer of a Team Purchase and an approved Own Purchase refund
  10: [
    { id: 1001, kind: "seat_claimed", actor: "Liam Thompson", courseTitle: "Building REST APIs with Node.js", minutesAgo: 60 * 3, read: false },
    { id: 1002, kind: "seat_claimed", actor: "Olivia Martinez", courseTitle: "Building REST APIs with Node.js", minutesAgo: 60 * 24 * 2, read: false },
    { id: 1003, kind: "refund_request_decided", decision: "Approved", courseSlug: "design-systems-with-tailwind", courseTitle: "Design Systems with Tailwind", teamPurchase: false, minutesAgo: 60 * 24 * 20, read: true },
  ],
  // Ava Nakamura, Buyer of a Team Purchase
  11: [
    { id: 1101, kind: "seat_claimed", actor: "Zara Haddad", courseTitle: "Introduction to TypeScript", minutesAgo: 45, read: false },
    { id: 1102, kind: "seat_claimed", actor: "Lucas Moreau", courseTitle: "Introduction to TypeScript", minutesAgo: 60 * 24 * 2, read: true },
  ],
};

// ─── Store ──────────────────────────────────────────────────────────────────

type MockState = {
  // read-state overrides by Notification id, on top of each fixture's default
  read: Record<number, boolean>;
  emailEnabled: boolean;
};

const INITIAL: MockState = { read: {}, emailEnabled: true };
let state = INITIAL;
const listeners = new Set<() => void>();

function setState(update: (prev: MockState) => MockState) {
  state = update(state);
  listeners.forEach((listener) => listener());
}

function useMockState() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => INITIAL
  );
}

function setRead(ids: number[], read: boolean) {
  setState((prev) => ({
    ...prev,
    read: { ...prev.read, ...Object.fromEntries(ids.map((id) => [id, read])) },
  }));
}

export function useMockEmailSwitch() {
  const { emailEnabled } = useMockState();
  return [
    emailEnabled,
    (enabled: boolean) => setState((prev) => ({ ...prev, emailEnabled: enabled })),
  ] as const;
}

// ─── Presentation ───────────────────────────────────────────────────────────

function href(n: MockNotification) {
  switch (n.kind) {
    case "question":
    case "reply":
      return `/courses/${n.courseSlug}/lessons/${n.lessonId}#comment-${n.commentId}`;
    case "refund_request_decided":
      return n.teamPurchase ? "/team" : `/courses/${n.courseSlug}`;
    case "seat_claimed":
      return "/team";
  }
}

// Who acted and what happened. Never the Comment body or a decision note.
function describe(n: MockNotification): { actor: string; text: string; where: string } {
  switch (n.kind) {
    case "question":
      return { actor: n.actor, text: "asked a Question", where: n.lessonTitle };
    case "reply":
      return {
        actor: n.actor,
        text: n.onYourQuestion ? "replied to your Question" : "replied in a thread you're in",
        where: n.lessonTitle,
      };
    case "refund_request_decided":
      return {
        actor: "Cadence",
        text: `${n.decision.toLowerCase()} your Refund Request`,
        where: n.courseTitle,
      };
    case "seat_claimed":
      return { actor: n.actor, text: "claimed a Seat", where: n.courseTitle };
  }
}

function ago(minutes: number) {
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / 60 / 24)}d ago`;
}

// ─── The bell ───────────────────────────────────────────────────────────────

export function NotificationBellMock({ userId }: { userId: number }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { read } = useMockState();

  const items = (MOCK_NOTIFICATIONS[userId] ?? [])
    .map((n) => ({ ...n, read: read[n.id] ?? n.read }))
    .sort((a, b) => a.minutesAgo - b.minutesAgo);
  const unread = items.filter((n) => !n.read);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={`Notifications, ${unread.length} Unread`}
        className="relative rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-4" />
        {unread.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
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
              onClick={() => setRead(unread.map((n) => n.id), true)}
              disabled={unread.length === 0}
              className="flex items-center gap-1 text-xs text-primary disabled:opacity-40"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              No Notifications yet.
            </p>
          ) : (
            <ul className="max-h-[28rem] overflow-y-auto">
              {items.map((n) => {
                const { actor, text, where } = describe(n);
                return (
                  <li
                    key={n.id}
                    className={cn("group flex border-b last:border-b-0", !n.read && "bg-primary/5")}
                  >
                    <button
                      onClick={() => {
                        setRead([n.id], true);
                        setOpen(false);
                        navigate(href(n));
                      }}
                      className="flex min-w-0 flex-1 gap-3 px-4 py-3 text-left hover:bg-accent"
                    >
                      <span className="mt-1.5 w-2 shrink-0">
                        {!n.read && <Circle className="size-2 fill-primary text-primary" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm", !n.read && "font-semibold")}>
                          {actor} {text}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {where} · {ago(n.minutesAgo)}
                        </span>
                      </span>
                    </button>
                    {n.read && (
                      <button
                        onClick={() => setRead([n.id], false)}
                        title="Mark Unread"
                        aria-label="Mark Unread"
                        className="px-3 text-muted-foreground opacity-0 hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                      >
                        <CircleDot className="size-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="border-t px-4 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Mock data · reload to reset
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
