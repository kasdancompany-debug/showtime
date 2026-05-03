"use client";

import { AlertTriangle, Info } from "lucide-react";

import { cn } from "@/lib/utils";

export type HostOperationalAlert = {
  id: string;
  variant: "warning" | "danger" | "info";
  title: string;
  description: string;
  actions?: React.ReactNode;
};

export function HostOperationalAlerts({ alerts }: { alerts: HostOperationalAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-3" role="region" aria-label="Showtime operational notices">
      {alerts.map((a) => (
        <div
          key={a.id}
          className={cn(
            "rounded-2xl border px-4 py-3 text-sm leading-relaxed",
            a.variant === "danger" && "border-red-500/45 bg-red-500/10 text-red-50",
            a.variant === "warning" && "border-amber-500/45 bg-amber-500/10 text-amber-50",
            a.variant === "info" && "border-[var(--bn-line)] bg-card/65 text-muted-foreground",
          )}
        >
          <div className="flex items-start gap-3">
            {a.variant === "info" ? (
              <Info className="mt-0.5 size-4 shrink-0 text-primary/85" aria-hidden />
            ) : (
              <AlertTriangle
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  a.variant === "danger" ? "text-red-300" : "text-amber-300",
                )}
                aria-hidden
              />
            )}
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-medium text-foreground">{a.title}</p>
              <p className={cn("text-xs leading-relaxed", a.variant === "info" ? "text-muted-foreground" : "text-foreground/90")}>
                {a.description}
              </p>
              {a.actions ? <div className="flex flex-wrap gap-2 pt-1">{a.actions}</div> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
