import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AppShellProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Standard operational surfaces: predictable viewport height, safe areas, no horizontal bleed scroll.
 */
export function AppShell({ children, className }: AppShellProps) {
  return (
    <div
      className={cn(
        "flex min-h-dvh w-full max-w-[100vw] flex-col overflow-x-hidden bg-[var(--kc-piano)] supports-[min-height:100dvh]:min-h-[100dvh]",
        className,
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        {children}
      </div>
    </div>
  );
}
