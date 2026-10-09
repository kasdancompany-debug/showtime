"use client";

import { useEffect, useState } from "react";

import { RedRule, ShowtimeLockup, StageBackdrop } from "@/components/brand";

export default function GatePage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState("/");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const n = params.get("next");
    if (n && n.startsWith("/") && !n.startsWith("//")) setNext(n);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Incorrect code.");
        return;
      }
      window.location.href = next;
    } catch {
      setError("Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[var(--sh-black)] px-6 py-12 text-[var(--sh-cream)]">
      <StageBackdrop />

      <main className="relative z-10 flex w-full max-w-xl flex-col items-center text-center">
        <div className="sh-rise" style={{ "--d": "0.5s" } as React.CSSProperties}>
          <ShowtimeLockup className="text-[clamp(3.1rem,11.5vw,8.25rem)]" />
        </div>

        <RedRule center delay={1.5} className="mt-7" />

        <p className="sh-eyebrow sh-rise mt-6" style={{ "--d": "1.7s" } as React.CSSProperties}>
          Kasdan Showtime · Operator access
        </p>

        <form
          onSubmit={onSubmit}
          className="sh-ticket sh-rise mt-9 w-full max-w-sm space-y-5 px-7 pb-8 pt-12 text-left"
          style={{ "--d": "1.9s" } as React.CSSProperties}
        >
          <span className="sh-caption absolute left-1/2 top-4 -translate-x-1/2 !text-[0.6rem] !tracking-[0.34em] !text-[var(--sh-gold)]">
            Admit one
          </span>

          <label htmlFor="gate-code" className="sh-caption block text-center !tracking-[0.34em]">
            Access code
          </label>
          <input
            id="gate-code"
            className="sh-input text-center font-mono text-[1.75rem] font-medium tracking-[0.5em] indent-[0.5em]"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="····"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "gate-error" : undefined}
          />

          <p
            id="gate-error"
            role="alert"
            className="sh-caption min-h-[1.1rem] text-center !tracking-[0.2em] !text-[var(--sh-red-hot)]"
          >
            {error}
          </p>

          <button type="submit" disabled={busy || !code.trim()} className="sh-btn sh-btn--red w-full">
            {busy ? "Checking…" : "Enter"}
          </button>
        </form>
      </main>
    </div>
  );
}
