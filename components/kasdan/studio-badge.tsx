"use client";

import Link from "next/link";

import { ShowtimeWordmark } from "@/components/brand";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** Kept for existing call sites — the badge no longer draws a seal. */
  showSeal?: boolean;
  /**
   * Badge target. Defaults to `"/"` (Showtime home). Pass `null` for a non-interactive badge
   * (e.g. kiosk surfaces where navigation would be disruptive).
   */
  href?: string | null;
};

/** "KASDAN" + the SHOWTIME wordmark — the studio signature used in headers. */
export function StudioBadge({ className, href }: Props) {
  const resolvedHref = href === undefined ? "/" : href;
  const isLink = resolvedHref != null && resolvedHref !== "";

  const classes = cn(
    "inline-flex items-center gap-2.5",
    isLink &&
      "no-underline transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--sh-cream)]",
    className,
  );

  const inner = (
    <>
      <span className="sh-caption !text-[0.58rem] !tracking-[0.3em]">Kasdan</span>
      <ShowtimeWordmark compact className="text-[1.3rem]" />
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
