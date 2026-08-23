"use client";

import { useEffect, useState } from "react";

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
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--kc-piano)] px-6 text-[var(--kc-cream)]">
      <form onSubmit={onSubmit} className="w-full max-w-xs space-y-6 text-center">
        <div className="space-y-2">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.32em] text-[var(--kc-champagne)]">Kasdan Co.</p>
          <h1 className="font-heading text-2xl font-normal text-[var(--kc-gold-bright)]">Operator access</h1>
        </div>
        <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--kc-gold-line)] to-transparent" aria-hidden />
        <div className="space-y-2 text-left">
          <Label htmlFor="gate-code" className="text-[var(--kc-champagne)]">
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
              "h-12 rounded-lg border-[color-mix(in_oklch,var(--kc-gold)_28%,transparent)] bg-black/50 text-center font-mono text-lg tracking-[0.3em] text-[var(--kc-cream)]",
            )}
            placeholder="····"
          />
        </div>
        {error ? <p className="text-sm font-medium text-[color-mix(in_oklch,var(--kc-velvet)_45%,var(--kc-cream))]">{error}</p> : null}
        <Button
          type="submit"
          disabled={busy || !code.trim()}
          className="h-11 w-full rounded-lg border border-[color-mix(in_oklch,var(--kc-gold-bright)_45%,transparent)] bg-[color-mix(in_oklch,var(--kc-gold-bright)_16%,black)] font-semibold text-[var(--kc-gold-bright)] hover:bg-[color-mix(in_oklch,var(--kc-gold-bright)_22%,black)]"
        >
          {busy ? "Checking…" : "Enter"}
        </Button>
      </form>
    </div>
  );
}
