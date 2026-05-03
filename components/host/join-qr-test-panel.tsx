"use client";

import { Smartphone } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { analyzeJoinUrlForPhones } from "@/lib/join/get-join-url";
import { cn } from "@/lib/utils";

type Props = {
  joinUrl: string;
  className?: string;
};

/**
 * Host-only QA strip: confirms the QR payload is reachable from typical phones.
 */
export function JoinQrTestPanel({ joinUrl, className }: Props) {
  const analysis = analyzeJoinUrlForPhones(joinUrl);

  return (
    <Card className={cn("border-[var(--bn-line)] bg-black/25 backdrop-blur-md", className)}>
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="flex items-center gap-2 font-heading text-base font-normal md:text-lg">
          <Smartphone className="size-5 shrink-0 text-primary" />
          QR test (phone reachability)
        </CardTitle>
        <CardDescription className="text-sm leading-relaxed md:text-base">
          Same URL encoded in the QR — scan this panel’s checks before doors open.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pb-5 pt-0 text-sm md:text-base">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Final URL</p>
          <p className="mt-1.5 break-all font-mono text-xs text-foreground/90 md:text-sm">{joinUrl || "—"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Phone-safe</span>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 font-mono text-xs font-semibold md:text-sm",
              analysis.phoneSafe ? "bg-emerald-500/15 text-emerald-200" : "bg-amber-500/15 text-amber-100",
            )}
          >
            {analysis.phoneSafe ? "Yes" : "No"}
          </span>
        </div>
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Recommended fix</p>
          <p className="mt-1.5 leading-relaxed text-muted-foreground">{analysis.recommendedFix}</p>
        </div>
      </CardContent>
    </Card>
  );
}
