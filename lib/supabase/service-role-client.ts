import { createClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "@/lib/supabase/env";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Server-only: bypasses RLS. Requires `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL`
 * (anon key is not required for this client).
 */
export function createSupabaseServiceRoleClient() {
  const { url } = getSupabaseConfig();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
