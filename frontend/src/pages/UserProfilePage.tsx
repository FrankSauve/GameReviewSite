import { Link, useParams } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { GET_USER_REVIEW_SUMMARIES } from "../graphql/queries";
import { useAuth } from "../contexts/AuthContext";
import { formatRating, ratingColor } from "../lib/rating";
import { formatHours } from "../lib/playtime";
import {
  ORDER_FOR,
  groupReviews,
  type Grouping,
  type ReviewSummary,
} from "../lib/grouping";
import { GroupedReviewList } from "../components/GroupedReviewList";
import { FavoritesGrid } from "../components/FavoritesGrid";
import { pickableGames } from "../lib/favorites";
import { ProfileBio } from "../components/ProfileBio";
import { Avatar } from "../components/Avatar";
import { AvatarColorPicker } from "../components/AvatarColorPicker";
import { EXPORT_REVIEWS_PATH, userPath } from "../lib/links";
import { useCanonicalPath } from "../hooks/useCanonicalPath";

interface ProfileUser {
  id: string;
  slug?: string | null;
  username: string;
  avatarColor?: string | null;
  bio?: string | null;
  reviewCount: number;
  averageRating?: number | null;
}

interface ProfileData {
  user: ProfileUser | null;
  reviewSummariesByUser: ReviewSummary[];
}

/** Favorites is the one tab that is not a view of the review list. */
export type ProfileTab = Grouping | "favorites";

const TABS: { tab: ProfileTab; label: string; path: string }[] = [
  { tab: "year", label: "By year", path: "" },
  { tab: "score", label: "By score", path: "by-score" },
  { tab: "recent", label: "Recent", path: "recent" },
  { tab: "favorites", label: "Favourites", path: "favorites" },
];

interface UserProfilePageProps {
  /**
   * Which view this route renders. By year is the default, per the brief — a
   * profile reads as a playing history rather than a posting log.
   */
  tab?: ProfileTab;
}

export function UserProfilePage({ tab = "year" }: UserProfilePageProps) {
  const { id } = useParams<{ id: string }>();
  const { user: me } = useAuth();

  // Favorites still needs the summaries: the header's totals come from them,
  // and the picker offers exactly the games they name. Borrowing the default
  // tab's ordering shares its cache entry rather than adding a fourth.
  const grouping: Grouping = tab === "favorites" ? "year" : tab;

  const { data, loading, error } = useQuery<ProfileData>(
    GET_USER_REVIEW_SUMMARIES,
    {
      variables: { id, order: ORDER_FOR[grouping] },
      skip: !id,
    },
  );

  const tabPath = TABS.find((t) => t.tab === tab)?.path ?? "";
  useCanonicalPath(data?.user ? userPath(data.user, tabPath) : null);

  if (loading) {
    return (
      <div className="space-y-6 page-column">
        <div className="card p-6 flex items-center gap-5 animate-pulse">
          <div className="w-16 h-16 rounded-pill bg-surface-raised shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-5 skeleton-bar w-40" />
            <div className="h-3 skeleton-bar w-28" />
          </div>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card h-16 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error || !data?.user) {
    return (
      <div className="empty-state space-y-3">
        <p className="text-4xl">👤</p>
        <p className="text-content-body font-medium">User not found</p>
        <Link
          to="/"
          className="text-accent-subtle-text hover:text-accent-subtle-text text-sm transition-colors duration-theme"
        >
          Back to home
        </Link>
      </div>
    );
  }

  const profile = data.user;
  const reviews = data.reviewSummariesByUser ?? [];
  const groups = groupReviews(reviews, grouping);
  const isOwnProfile = me?.id === profile.id;

  const totalHours = reviews
    .map((r) => r.hoursPlayed)
    .filter((h): h is number => h != null)
    .reduce((sum, h) => sum + h, 0);

  return (
    <div className="space-y-6 page-column">
      {/* ── Profile header ── */}
      <div className="card p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
        {isOwnProfile ? (
          <AvatarColorPicker user={profile} />
        ) : (
          <Avatar user={profile} size={16} />
        )}
        <div className="flex-1 text-center sm:text-left space-y-1">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <h1 className="font-display text-xl text-content">
              {profile.username}
            </h1>
            {isOwnProfile && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-pill bg-accent-subtle/60 text-accent-subtle-text border border-accent-subtle-border">
                You
              </span>
            )}
            {/*
              A plain link, not a fetch-then-Blob: the request carries the
              session cookie either way, and letting the browser handle the
              download means the file never has to exist in memory here. Only
              on your own profile, because the endpoint only ever writes the
              reviews of whoever is signed in.
            */}
            {isOwnProfile && profile.reviewCount > 0 && (
              <a
                href={EXPORT_REVIEWS_PATH}
                download
                className="text-xs font-medium text-content-muted hover:text-accent-subtle-text transition-colors duration-theme"
              >
                Export as zip
              </a>
            )}
          </div>
          <div className="pt-1">
            <ProfileBio bio={profile.bio} isOwnProfile={isOwnProfile} />
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 pt-2">
            <div className="text-center">
              <p className="font-display text-lg text-content">
                {profile.reviewCount}
              </p>
              <p className="text-xs text-content-subtle">
                {profile.reviewCount === 1 ? "review" : "reviews"}
              </p>
            </div>
            {profile.averageRating != null && (
              <div className="text-center">
                <p
                  className={`text-lg font-bold ${ratingColor(profile.averageRating)}`}
                >
                  {formatRating(Math.round(profile.averageRating * 10) / 10)}
                </p>
                <p className="text-xs text-content-subtle">avg score</p>
              </div>
            )}
            {totalHours > 0 && (
              <div className="text-center">
                <p className="font-display text-lg text-content">
                  {formatHours(Math.round(totalHours))}
                </p>
                <p className="text-xs text-content-subtle">played</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── View tabs ── */}
      <nav className="flex gap-1 border-b border-line">
        {TABS.map((entry) => {
          const active = entry.tab === tab;
          return (
            <Link
              key={entry.tab}
              to={userPath(profile, entry.path)}
              aria-current={active ? "page" : undefined}
              className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 transition-colors duration-theme ${
                active
                  ? "border-accent-hover text-accent-subtle-text"
                  : "border-transparent text-content-subtle hover:text-content-body"
              }`}
            >
              {entry.label}
            </Link>
          );
        })}
      </nav>

      {/* ── Favorites, or the reviews every other tab shows ── */}
      {tab === "favorites" ? (
        <FavoritesGrid
          userId={profile.id}
          isOwnProfile={isOwnProfile}
          pickable={pickableGames(reviews)}
        />
      ) : groups.length === 0 ? (
        <div className="card p-10 text-center space-y-2">
          <p className="text-3xl">✍️</p>
          <p className="text-content-muted">
            {isOwnProfile
              ? "You haven't written any reviews yet."
              : "No reviews yet."}
          </p>
        </div>
      ) : (
        <GroupedReviewList groups={groups} showGroupAverage={tab === "year"} />
      )}
    </div>
  );
}
