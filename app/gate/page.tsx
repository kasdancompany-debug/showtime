"use client";

import { useEffect, useState } from "react";

import { DecoChevronDivider, DecoCorners, DecoSunburst } from "@/components/kasdan/deco-motifs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[var(--kc-piano)] px-6 text-[var(--kc-cream)]">
      <DecoSunburst />

      <div className="relative z-[1] flex w-full max-w-md flex-col items-center text-center">
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.5em] text-[var(--kc-champagne)]">Kasdan Showtime</p>
        <h1
          className={cn(
            "mt-4 font-heading text-[clamp(2.75rem,9vw,4.5rem)] font-normal leading-[1.02] tracking-tight text-[var(--kc-gold-bright)]",
            "drop-shadow-[0_0_38px_color-mix(in_oklch,var(--kc-gold-bright)_38%,transparent)]",
          )}
        >
          Kasdan Showtime
        </h1>
        <p className="mt-3 text-[0.68rem] font-bold uppercase tracking-[0.42em] text-[var(--kc-champagne)]">
          Operator access
        </p>

        <DecoChevronDivider className="mt-8 max-w-xs" />

        <form onSubmit={onSubmit} className="relative mt-10 w-full max-w-xs space-y-6 rounded-lg px-8 py-9">
          <DecoCorners />
          <div className="space-y-3 text-left">
            <Label
              htmlFor="gate-code"
              className="block text-center text-[0.65rem] font-bold uppercase tracking-[0.4em] text-[var(--kc-champagne)]"
            >
              Access code
            </Label>
            <Input
              id="gate-code"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={cn(
                "h-16 rounded-md border-[color-mix(in_oklch,var(--kc-gold-bright)_38%,transparent)] bg-black/60 text-center font-mono text-[2rem] font-semibold tracking-[0.55em] text-[var(--kc-gold-bright)]",
                "shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--kc-gold-line)_60%,transparent)] focus-visible:ring-[color-mix(in_oklch,var(--kc-gold-bright)_45%,transparent)]",
              )}
              placeholder="····"
            />
          </div>
          {error ? (
            <p className="text-sm font-semibold text-[color-mix(in_oklch,var(--kc-velvet)_45%,var(--kc-cream))]">{error}</p>
          ) : null}
          <Button
            type="submit"
            disabled={busy || !code.trim()}
            className="h-12 w-full rounded-md border border-[color-mix(in_oklch,var(--kc-gold-bright)_55%,transparent)] bg-[color-mix(in_oklch,var(--kc-gold-bright)_18%,black)] text-[0.8rem] font-bold uppercase tracking-[0.3em] text-[var(--kc-gold-bright)] hover:bg-[color-mix(in_oklch,var(--kc-gold-bright)_26%,black)]"
          >
            {busy ? "Checking…" : "Enter"}
          </Button>
        </form>

        <DecoChevronDivider className="mt-10 max-w-xs" />
      </div>
    </div>
  );
}
