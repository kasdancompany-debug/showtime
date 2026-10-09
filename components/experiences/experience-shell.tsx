import type { ReactNode } from "react";
import Link from "next/link";

import { StudioBadge } from "@/components/kasdan";
import { RedRule } from "@/components/brand";
import { cn } from "@/lib/utils";

type Props = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  className?: string;
};

export function ExperienceShell({
  children,
  title,
  subtitle,
  backHref = "/experiences",
  backLabel = "All experiences",
  className,
}: Props) {
  return (
    <div className={cn("experience-studio min-h-full bg-[var(--sh-black)] text-[var(--sh-cream)]", className)}>
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgb(214_40_40/0.14),transparent_55%)]"
        aria-hidden
      />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 md:px-8 md:py-14">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <StudioBadge />
            {title ? (
              <div>
                <h1 className="sh-display text-4xl md:text-5xl">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--sh-cream-dim)]">{subtitle}</p>
                ) : null}
              </div>
            ) : null}
          </div>
          <Link
            href={backHref}
            className="sh-caption !text-[0.65rem] !tracking-[0.22em] transition-colors hover:!text-[var(--sh-cream)]"
          >
            ← {backLabel}
          </Link>
        </header>
        {title ? <RedRule className="-mt-3" /> : null}
        {children}
      </div>
    </div>
  );
}
