"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Ticket } from "lucide-react";

import { FilmGrain } from "@/components/cinematic/film-grain";
import { GoldButton, StudioBadge, TheatreCurtainBackground } from "@/components/kasdan";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeJoinEventCode } from "@/lib/join/get-join-url";
import { cn } from "@/lib/utils";

export function ManualJoinClient() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    const normalized = normalizeJoinEventCode(code);
    if (normalized.length < 3) {
      setErr("Enter at least 3 characters (the code from the host screen).");
      return;
    }
    setErr(null);
    router.push(`/join/${encodeURIComponent(normalized)}`);
  }

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col overflow-x-hidden bg-[var(--kc-bg-deep)] text-[var(--kc-cream)] supports-[min-height:100dvh]:min-h-[100dvh]">
      <TheatreCurtainBackground intensity="subtle" />
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_120px_rgba(0,0,0,0.72)]" />
      <FilmGrain />
      <div className="relative z-[2] mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-12">
        <header className="mb-10 flex items-center justify-between gap-4">
          <StudioBadge href="/" showSeal />
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground")}
          >
            Home
          </Link>
        </header>

        <div className="rounded-3xl border border-white/10 bg-black/45 p-8 backdrop-blur-xl">
          <div className="mb-6 flex items-center gap-3">
            <Ticket className="size-8 text-primary" aria-hidden />
            <div>
              <h1 className="font-heading text-2xl font-normal">Join manually</h1>
              <p className="mt-1 text-sm text-muted-foreground">Type the event code from the host desk or QR.</p>
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor="manual-code" className="text-xs uppercase tracking-wider text-[var(--kc-champagne)]">
              Event code
            </Label>
            <Input
              id="manual-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setErr(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              placeholder="e.g. NIGHT1"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="h-12 rounded-xl border-white/15 bg-black/40 font-mono text-lg tracking-[0.2em]"
            />
            {err ? (
              <p className="text-sm text-red-400/95" role="alert">
                {err}
              </p>
            ) : null}
          </div>

          <GoldButton
            type="button"
            className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-xs uppercase tracking-[0.15em]"
            onClick={submit}
          >
            Continue <ArrowRight className="size-4" />
          </GoldButton>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Scanning the QR opens this page automatically with the code filled in.
          </p>
        </div>
      </div>
    </div>
  );
}
