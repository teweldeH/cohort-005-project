import type { ReactNode } from "react";
import { Logo } from "~/components/logo";
import { Card, CardContent } from "~/components/ui/card";

/**
 * The frame around login and signup: the landing page's logo and soft
 * indigo backdrop, so leaving `/` to sign in does not feel like a new site.
 */
export function AuthShell({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  /** The line under the card that links to the other auth page. */
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 left-1/2 h-[28rem] w-[48rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-400/25 via-violet-400/25 to-fuchsia-400/20 blur-3xl dark:from-indigo-600/20 dark:via-violet-600/20 dark:to-fuchsia-600/15" />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo size="lg" />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            {title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Card className="shadow-lg shadow-primary/5">
          <CardContent className="p-6">{children}</CardContent>
        </Card>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          {footer}
        </p>
      </div>
    </div>
  );
}
