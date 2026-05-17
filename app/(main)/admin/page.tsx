import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <p className="text-muted-foreground text-sm">Build and manage live audience shows.</p>
      <ul className="space-y-2">
        <li>
          <Link href="/admin/story" className={buttonVariants({ variant: "default" })}>
            Show builder
          </Link>
        </li>
        <li>
          <Link href="/test-run" className={buttonVariants({ variant: "outline" })}>
            E2E test run (NIGHT1)
          </Link>
        </li>
      </ul>
    </div>
  );
}
