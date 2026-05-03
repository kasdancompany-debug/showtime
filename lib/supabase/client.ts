"use client";

import { createClient } from "@supabase/supabase-js";

import { getSupabaseConfig } from "./env";
import type { Database } from "./database.types";

/**
 * Browser Supabase client. Returns null when env is not configured (mock-only mode).
 */
export function createSupabaseBrowserClient() {
  const { url, anonKey, isConfigured } = getSupabaseConfig();
  if (!isConfigured) return null;
  return createClient<Database>(url, anonKey);
}
