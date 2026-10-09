"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { RedRule, ShowtimeLockup, StageBackdrop } from "@/components/brand";
import { normalizeJoinEventCode } from "@/lib/join/get-join-url";

export function ManualJoinClient() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    const normalized = normalizeJoinEventCode(code);
    if (normalized.length < 3) {
      setErr("Enter at least 3 characters (the code on your ticket or the big screen).");
      return;
    }
    setErr(null);
    router.push(`/join/${encodeURIComponent(normalized)}`);
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[var(--sh-black)] px-6 py-12 text-center text-[var(--sh-cream)] supports-[min-height:100dvh]:min-h-[100dvh]">
      <StageBackdrop curtains={false} />

      <main className="relative z-10 flex w-full max-w-md flex-col items-center">
        <Link
          href="/"
          aria-label="Showtime home"
          className="sh-rise focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-[var(--sh-cream)]"
          style={{ "--d": "0.1s" } as React.CSSProperties}
        >
          <ShowtimeLockup className="text-[clamp(2.75rem,15vw,4.75rem)]" />
        </Link>

        <RedRule center delay={0.9} className="mt-6" />

        <form
          className="sh-ticket sh-rise mt-8 w-full space-y-5 px-7 pb-8 pt-12 text-left"
          style={{ "--d": "1s" } as React.CSSProperties}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <span className="sh-caption absolute left-1/2 top-4 -translate-x-1/2 !text-[0.6rem] !tracking-[0.34em] !text-[var(--sh-gold)]">
            Admit one
          </span>

          <label htmlFor="manual-code" className="sh-caption block text-center !tracking-[0.34em]">
            Event code
          </label>
          <input
            id="manual-code"
            className="sh-input text-center font-mono text-[1.6rem] font-medium uppercase tracking-[0.3em] indent-[0.3em]"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setErr(null);
            }}
            placeholder="NIGHT1"
            autoCapitalize="characters"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={err ? true : undefined}
            aria-describedby={err ? "manual-code-error" : undefined}
          />

          <p
            id="manual-code-error"
            role="alert"
            className="sh-caption min-h-[2.2rem] text-center !normal-case !tracking-[0.04em] !text-[var(--sh-red-hot)]"
          >
            {err}
          </p>

          <button type="submit" className="sh-btn sh-btn--red w-full">
            Continue <ArrowRight className="size-4" aria-hidden />
          </button>
        </form>

        <p className="sh-caption sh-rise mt-8" style={{ "--d": "1.3s" } as React.CSSProperties}>
          Enter the code on your ticket or the big screen.
        </p>
      </main>
    </div>
  );
}
