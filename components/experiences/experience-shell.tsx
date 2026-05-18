import type { ReactNode } from "react";
import Link from "next/link";

import { StudioBadge } from "@/components/kasdan";
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
    <div className={cn("experience-studio min-h-full bg-[var(--kc-piano)] text-[var(--kc-cream)]", className)}>
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,color-mix(in_oklch,var(--kc-gold-bright)_12%,transparent),transparent_55%)]"
        aria-hidden
      />
      <div className="relative mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 md:px-8 md:py-14">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <StudioBadge />
            {title ? (
              <div>
                <h1 className="font-serif text-3xl font-light tracking-tight text-[var(--kc-cream)] md:text-4xl">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--kc-champagne)]">{subtitle}</p>
                ) : null}
              </div>
            ) : null}
          </div>
          <Link
            href={backHref}
            className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--kc-champagne)] transition-colors hover:text-[var(--kc-gold-bright)]"
          >
            ← {backLabel}
          </Link>
        </header>
        {children}
      </div>
    </div>
  );
}
