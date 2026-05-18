/** URL-safe slug from a title (e.g. "Midnight Run" → midnight-run). */
export function slugifyExperienceTitle(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length >= 2 ? base.slice(0, 80) : "experience";
}

export function uniqueExperienceSlug(base: string, taken: Set<string>): string {
  const root = slugifyExperienceTitle(base);
  if (!taken.has(root)) return root;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${root}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${root}-${Date.now()}`;
}
