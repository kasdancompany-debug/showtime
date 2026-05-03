import Link from "next/link";

import { StudioBadge } from "@/components/kasdan";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col bg-[var(--kc-bg-deep)] px-6 py-10 text-[var(--kc-cream)] supports-[min-height:100dvh]:min-h-[100dvh]">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col">
        <StudioBadge href="/" showSeal className="w-fit shrink-0" />
        <p className="mt-8 font-mono text-xs font-semibold uppercase tracking-[0.28em] text-[var(--kc-champagne)]/90">
          404
        </p>
        <h1 className="mt-3 font-heading text-3xl font-normal tracking-tight text-[var(--kc-cream)] sm:text-4xl">
          This path is not part of Showtime
        </h1>
        <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
          The URL may be mistyped, or the page may have moved. There is no separate documentation site here — use the
          links below to get back to the live app.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "default" }), "inline-flex min-h-11 justify-center rounded-xl px-6")}
          >
            Home
          </Link>
          <Link
            href="/join"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "inline-flex min-h-11 justify-center rounded-xl border-white/15 px-6",
            )}
          >
            Join with a code
          </Link>
          <Link
            href="/host"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "inline-flex min-h-11 justify-center rounded-xl border-white/15 px-6",
            )}
          >
            Operator
          </Link>
        </div>
      </div>
    </div>
  );
}
