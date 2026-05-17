/** Build a show code from a working title (e.g. "Davey does it" → DAVEY_DOES_IT). */
export function slugTitleToShowCode(title: string): string {
  const slug = title
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug.length >= 3 ? slug.slice(0, 40) : "";
}
