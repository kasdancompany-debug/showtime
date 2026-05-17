import type { ReactNode } from "react";

/**
 * Fill the main app shell (already inset by safe areas). Do not use h-[100dvh] here —
 * that stacks on top of AppShell padding and triggers a document scrollbar alongside
 * the desk’s own overflow-y (double scrollbars).
 */
export default function HostLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">{children}</div>;
}
