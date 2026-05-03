import { createClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "./env";
import type { Database } from "./database.types";

/**
 * Service-role or anon server client for Route Handlers / Server Actions.
 * Returns null when env is not configured.
 */
export function createSupabaseServerClient() {
  const { url, anonKey, isConfigured } = getSupabaseConfig();
  if (!isConfigured) return null;
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
