import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type ShowScreenShellProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Room projection surface: one viewport tall, no document scroll, video region owns flex space.
 */
export function ShowScreenShell({ children, className }: ShowScreenShellProps) {
  return (
    <div
      className={cn("fixed inset-0 z-[200] flex flex-col bg-black overscroll-none [touch-action:pan-x_pan-y]", className)}
      style={{
        height: "100dvh",
        maxHeight: "100dvh",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
        paddingRight: "env(safe-area-inset-right)",
        overscrollBehavior: "none",
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden overscroll-none">{children}</div>
    </div>
  );
}
