import type { ReactNode } from "react";

/**
 * Lock the operator desk to the dynamic viewport so only in-page drawers scroll,
 * not the document body (avoids nested scroll traps on laptop screens).
 */
export default function HostLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-1 flex-col overflow-hidden supports-[height:100dvh]:h-[100dvh] supports-[height:100dvh]:max-h-[100dvh]">
      {children}
    </div>
  );
}
