"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Ticket } from "lucide-react";

import { StudioBadge } from "@/components/kasdan";
import { Button, buttonVariants } from "@/components/ui/button";
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
      setErr("Enter at least 3 characters (the code from the host).");
      return;
    }
    setErr(null);
    router.push(`/join/${encodeURIComponent(normalized)}`);
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-1 flex-col bg-background px-5 py-12 text-foreground supports-[min-height:100dvh]:min-h-[100dvh]">
      <header className="mb-8 flex items-center justify-between gap-4">
        <StudioBadge href="/" showSeal />
        <Link href="/" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground")}>
          Home
        </Link>
      </header>

      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <Ticket className="size-7 text-primary" aria-hidden />
          <div>
            <h1 className="text-xl font-semibold">Join</h1>
            <p className="mt-1 text-sm text-muted-foreground">Enter the event code from the operator desk.</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="manual-code" className="text-xs uppercase tracking-wide text-muted-foreground">
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
            className="h-11 font-mono text-lg tracking-widest"
          />
          {err ? (
            <p className="text-sm text-destructive" role="alert">
              {err}
            </p>
          ) : null}
        </div>

        <Button type="button" className="mt-6 h-11 w-full" onClick={submit}>
          Continue <ArrowRight className="ml-2 size-4" />
        </Button>
      </div>
    </div>
  );
}
