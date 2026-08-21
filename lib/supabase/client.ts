"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "./env";
import type { Database } from "./database.types";

let browserClient: SupabaseClient<Database> | null = null;

/**
 * Browser Supabase client. Returns null when env is not configured (mock-only mode).
 * Module-scoped singleton — every caller shares one GoTrue/Realtime instance instead of
 * each hook/component spinning up its own (was firing "Multiple GoTrueClient instances").
 */
export function createSupabaseBrowserClient() {
  const { url, anonKey, isConfigured } = getSupabaseConfig();
  if (!isConfigured) return null;
  if (!browserClient) {
    browserClient = createClient<Database>(url, anonKey);
  }
  return browserClient;
}
