import type { Grouping } from "./grouping";

/** Favorites and Awards are the tabs that are not a view of the review list. */
export type ProfileTab = Grouping | "favorites" | "awards";

/** A view of the review list, so it takes the genre filter. */
export function isReviewTab(tab: ProfileTab): tab is Grouping {
  return tab !== "favorites" && tab !== "awards";
}

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
  awards: "awards",
};

/** The profile's tab strip, in order. */
export const PROFILE_TABS: { tab: ProfileTab; label: string }[] = [
  { tab: "year", label: "Year" },
  { tab: "score", label: "Score" },
  { tab: "genre", label: "Genre" },
  { tab: "recent", label: "Recent" },
  { tab: "favorites", label: "Favourites" },
  { tab: "awards", label: "Awards" },
];

const routeFor = (sub: string) => (sub ? `/users/:id/${sub}` : "/users/:id");

/**
 * Every route App.tsx mounts for a profile. By year is also at `by-year`, so a
 * link to it survives the default changing. Awards takes an optional year.
 */
export const PROFILE_ROUTES: { path: string; tab: ProfileTab }[] = [
  ...PROFILE_TABS.map(({ tab }) => ({
    path: routeFor(PROFILE_TAB_PATH[tab]),
    tab,
  })),
  { path: routeFor("by-year"), tab: "year" },
  { path: routeFor("awards/:year"), tab: "awards" },
];
