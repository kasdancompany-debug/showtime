import Link from "next/link";

import { RedRule, ShowtimeLockup, StageBackdrop } from "@/components/brand";

export default function NotFound() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[var(--sh-black)] px-6 py-12 text-center text-[var(--sh-cream)] supports-[min-height:100dvh]:min-h-[100dvh]">
      <StageBackdrop />
      <main className="relative z-10 flex w-full max-w-xl flex-col items-center">
        <p className="sh-eyebrow">Error · 404</p>
        <h1 className="sh-display mt-4 text-[clamp(2.75rem,11vw,6rem)]">
          Lost the plot<span className="sh-accent">.</span>
        </h1>
        <RedRule center className="mt-6" />
        <p className="mt-6 max-w-md text-base leading-relaxed text-[var(--sh-cream-dim)] sm:text-lg">
          This path is not part of Showtime. The URL may be mistyped, or the page may have moved.
        </p>
        <div className="mt-9 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Link href="/" className="sh-btn sh-btn--red">
            Home
          </Link>
          <Link href="/join" className="sh-btn sh-btn--ghost">
            Join with a code
          </Link>
          <Link href="/host" className="sh-btn sh-btn--ghost">
            Operator
          </Link>
        </div>
        <div className="mt-14 opacity-80">
          <ShowtimeLockup className="text-[1.6rem]" />
        </div>
      </main>
    </div>
  );
}
