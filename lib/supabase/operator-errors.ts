/** Plain-language copy for operator UI when Supabase calls fail. */
export function friendlySupabaseError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    const m = (err as { message: string }).message;
    if (/permission denied|row-level security|RLS/i.test(m)) {
      return "That action was blocked. Refresh the page and make sure you are online, then try again.";
    }
    if (/JWT|session|not authenticated/i.test(m)) {
      return "Your session is not valid anymore. Refresh this page to reconnect.";
    }
    if (/network|fetch failed|Failed to fetch/i.test(m)) {
      return "We could not reach the server. Check your internet connection and try again.";
    }
    return m;
  }
  return "Something went wrong. Please try again.";
}
