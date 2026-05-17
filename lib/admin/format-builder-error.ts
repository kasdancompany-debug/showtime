/**
 * User-facing copy for Show Builder; keep `technical` for the collapsible dev panel.
 */
export function formatBuilderError(err: unknown): { friendly: string; technical: string } {
  const technical =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: unknown }).message)
      : typeof err === "string"
        ? err
        : JSON.stringify(err, null, 2);

  const m = technical.toLowerCase();
  const raw = technical;

  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return {
      friendly:
        "We could not reach Supabase from your browser. Check your internet connection, VPN, firewall, and that your Supabase project is running — then try again.",
      technical: raw,
    };
  }
  if (/permission denied|row-level security|\brls\b/i.test(raw)) {
    return {
      friendly:
        "Supabase blocked this action (row security). You may need to sign in with a role that can edit events, or create the show in the Supabase dashboard.",
      technical: raw,
    };
  }
  if (/jwt|session|not authenticated|invalid login/i.test(m)) {
    return {
      friendly: "Your session with Supabase is no longer valid. Refresh this page to reconnect, then try again.",
      technical: raw,
    };
  }
  if (/duplicate key|unique constraint|already exists|23505/i.test(raw)) {
    return {
      friendly: "That show code is already in use. Load the existing show or pick a different code.",
      technical: raw,
    };
  }
  if (/violates foreign key|23503/i.test(raw)) {
    return {
      friendly: "A linked row is missing in the database (foreign key). Your team may need to fix data in Supabase.",
      technical: raw,
    };
  }

  return {
    friendly: raw.length > 200 ? `${raw.slice(0, 197)}…` : raw || "Something went wrong. Please try again.",
    technical: raw,
  };
}
