import type { StoryGraph } from "@/types";

export const SAVED_FILMS_STORAGE_KEY = "showtime-saved-films-v1";

/** Same-tab listeners (e.g. operator desk) refresh when the catalog changes. */
export const SAVED_FILMS_CHANGED_EVENT = "showtime-saved-films-changed";

const MAX_FILMS = 48;

export type SavedFilm = {
  id: string;
  name: string;
  /** Shown as the night title on /screen and /host when this film is loaded. */
  eventTitle: string;
  graph: StoryGraph;
  savedAt: number;
};

function safeParse(raw: string | null): SavedFilm[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(isSavedFilm);
  } catch {
    return [];
  }
}

function isSavedFilm(x: unknown): x is SavedFilm {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const g = o.graph as StoryGraph | undefined;
  if (
    typeof o.id !== "string" ||
    typeof o.name !== "string" ||
    typeof o.eventTitle !== "string" ||
    typeof o.savedAt !== "number" ||
    g == null ||
    typeof g !== "object" ||
    typeof g.rootId !== "string" ||
    typeof g.nodes !== "object" ||
    g.nodes == null
  ) {
    return false;
  }
  return Boolean(g.nodes[g.rootId]);
}

export function listSavedFilms(): SavedFilm[] {
  if (typeof window === "undefined") return [];
  try {
    return safeParse(window.localStorage.getItem(SAVED_FILMS_STORAGE_KEY));
  } catch {
    return [];
  }
}

function persist(films: SavedFilm[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVED_FILMS_STORAGE_KEY, JSON.stringify(films));
    window.dispatchEvent(new Event(SAVED_FILMS_CHANGED_EVENT));
  } catch {
    /* quota */
  }
}

export function addSavedFilm(params: { name: string; eventTitle: string; graph: StoryGraph }): SavedFilm | null {
  const name = params.name.trim();
  if (!name) return null;
  const eventTitle = params.eventTitle.trim() || name;
  const record: SavedFilm = {
    id: `film_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name,
    eventTitle,
    graph: JSON.parse(JSON.stringify(params.graph)) as StoryGraph,
    savedAt: Date.now(),
  };
  const next = [record, ...listSavedFilms()].slice(0, MAX_FILMS);
  persist(next);
  return record;
}

export function removeSavedFilm(id: string) {
  persist(listSavedFilms().filter((f) => f.id !== id));
}

export function getSavedFilm(id: string): SavedFilm | undefined {
  return listSavedFilms().find((f) => f.id === id);
}
