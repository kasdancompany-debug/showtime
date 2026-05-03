import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";

export default function MainAppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
