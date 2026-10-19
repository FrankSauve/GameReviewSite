import type { Grouping } from "./grouping";

/** Favorites is the one tab that is not a view of the review list. */
export type ProfileTab = Grouping | "favorites";

/**
 * The path under `/users/<slug>` that renders each tab. By year is the bare
 * profile: a profile reads as a playing history, not a posting log.
 */
export const PROFILE_TAB_PATH: Record<ProfileTab, string> = {
  year: "",
  score: "by-score",
  genre: "by-genre",
  recent: "recent",
  favorites: "favorites",
};

/** The orderings of the review list, in Sort by menu order. */
export const PROFILE_VIEWS: { grouping: Grouping; label: string }[] = [
  { grouping: "year", label: "By year" },
  { grouping: "score", label: "By score" },
  { grouping: "genre", label: "By genre" },
  { grouping: "recent", label: "Recent" },
];

const routeFor = (sub: string) => (sub ? `/users/:id/${sub}` : "/users/:id");

/**
 * Every route App.tsx mounts for a profile. By year is also at `by-year`, so a
 * link to it survives the default changing.
 */
export const PROFILE_ROUTES: { path: string; tab: ProfileTab }[] = [
  ...PROFILE_VIEWS.map((v) => ({
    path: routeFor(PROFILE_TAB_PATH[v.grouping]),
    tab: v.grouping,
  })),
  { path: routeFor(PROFILE_TAB_PATH.favorites), tab: "favorites" },
  { path: routeFor("by-year"), tab: "year" },
];
