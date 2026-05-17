"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  showSeal?: boolean;
  /**
   * Badge target. Defaults to `"/"` (Showtime home). Pass `null` for a non-interactive badge
   * (e.g. kiosk surfaces where navigation would be disruptive).
   */
  href?: string | null;
};

export function StudioBadge({ className, showSeal = false, href }: Props) {
  const resolvedHref = href === undefined ? "/" : href;
  const isLink = resolvedHref != null && resolvedHref !== "";

  const classes = cn(
    "inline-flex items-center gap-2 rounded-md border border-[oklch(0.72_0.04_78/0.18)] bg-[oklch(0.12_0.015_260/0.65)] px-3 py-1.5 backdrop-blur-sm",
    isLink &&
      "no-underline transition-[opacity,border-color,box-shadow] hover:border-[oklch(0.72_0.04_78/0.28)] hover:opacity-[0.92] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.88_0.05_85/0.45)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--kc-bg-deep,oklch(0.14_0.03_55))]",
    className,
  );

  const inner = (
    <>
      <span className="font-[family-name:var(--font-ui)] text-[0.6875rem] font-medium uppercase tracking-[0.2em] text-[oklch(0.88_0.03_85)]">
        Kasdan Co.
      </span>
      {showSeal ? (
        <span className="select-none text-[0.5rem] leading-none text-[oklch(0.65_0.02_85)] opacity-50" aria-hidden>
          ·
        </span>
      ) : null}
    </>
  );

  if (isLink) {
    return (
      <Link href={resolvedHref} className={classes} aria-label="Showtime home">
        {inner}
      </Link>
    );
  }

  return <div className={classes}>{inner}</div>;
}
