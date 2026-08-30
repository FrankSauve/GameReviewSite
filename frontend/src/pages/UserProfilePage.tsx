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
import { ProfileBio } from "../components/ProfileBio";
import { EXPORT_REVIEWS_PATH, userPath } from "../lib/links";
import { useCanonicalPath } from "../hooks/useCanonicalPath";

interface ProfileUser {
  id: string;
  slug?: string | null;
  username: string;
  bio?: string | null;
  reviewCount: number;
  averageRating?: number | null;
}

interface ProfileData {
  user: ProfileUser | null;
  reviewSummariesByUser: ReviewSummary[];
}

function avatarGradient(username: string): string {
  const gradients = [
    "from-violet-600 to-indigo-700",
    "from-rose-600 to-pink-700",
    "from-emerald-600 to-teal-700",
    "from-blue-600 to-cyan-700",
    "from-amber-600 to-orange-700",
    "from-fuchsia-600 to-purple-700",
  ];
  const idx = [...username].reduce((a, c) => a + c.charCodeAt(0), 0) % gradients.length;
  return gradients[idx];
}

const TABS: { grouping: Grouping; label: string; path: string }[] = [
  { grouping: "year", label: "By year", path: "" },
  { grouping: "score", label: "By score", path: "by-score" },
  { grouping: "recent", label: "Recent", path: "recent" },
];

interface UserProfilePageProps {
  /**
   * Which view this route renders. By year is the default, per the brief — a
   * profile reads as a playing history rather than a posting log.
   */
  grouping?: Grouping;
}

export function UserProfilePage({ grouping = "year" }: UserProfilePageProps) {
  const { id } = useParams<{ id: string }>();
  const { user: me } = useAuth();

  const { data, loading, error } = useQuery<ProfileData>(GET_USER_REVIEW_SUMMARIES, {
    variables: { id, order: ORDER_FOR[grouping] },
    skip: !id,
  });

  const tabPath = TABS.find((t) => t.grouping === grouping)?.path ?? "";
  useCanonicalPath(data?.user ? userPath(data.user, tabPath) : null);

  if (loading) {
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="card p-6 flex items-center gap-5 animate-pulse">
          <div className="w-16 h-16 rounded-full bg-gray-800 shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-5 bg-gray-800 rounded w-40" />
            <div className="h-3 bg-gray-800 rounded w-28" />
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
      <div className="card p-12 text-center space-y-3">
        <p className="text-4xl">👤</p>
        <p className="text-gray-300 font-medium">User not found</p>
        <Link to="/" className="text-violet-400 hover:text-violet-300 text-sm transition-colors">
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
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* ── Profile header ── */}
      <div className="card p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
        <div
          className={`w-16 h-16 rounded-full bg-gradient-to-br ${avatarGradient(profile.username)} flex items-center justify-center text-2xl font-black text-white shrink-0`}
        >
          {profile.username[0].toUpperCase()}
        </div>
        <div className="flex-1 text-center sm:text-left space-y-1">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <h1 className="text-xl font-bold text-gray-100">{profile.username}</h1>
            {isOwnProfile && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-violet-900/60 text-violet-300 border border-violet-800">
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
                className="text-xs font-medium text-gray-400 hover:text-violet-300 transition-colors"
              >
                Export as markdown
              </a>
            )}
          </div>
          <div className="pt-1">
            <ProfileBio bio={profile.bio} isOwnProfile={isOwnProfile} />
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 pt-2">
            <div className="text-center">
              <p className="text-lg font-bold text-gray-100">{profile.reviewCount}</p>
              <p className="text-xs text-gray-500">
                {profile.reviewCount === 1 ? "review" : "reviews"}
              </p>
            </div>
            {profile.averageRating != null && (
              <div className="text-center">
                <p className={`text-lg font-bold ${ratingColor(profile.averageRating)}`}>
                  {formatRating(Math.round(profile.averageRating * 10) / 10)}
                </p>
                <p className="text-xs text-gray-500">avg score</p>
              </div>
            )}
            {totalHours > 0 && (
              <div className="text-center">
                <p className="text-lg font-bold text-gray-100">
                  {formatHours(Math.round(totalHours))}
                </p>
                <p className="text-xs text-gray-500">played</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── View tabs ── */}
      <nav className="flex gap-1 border-b border-gray-800">
        {TABS.map((tab) => {
          const active = tab.grouping === grouping;
          return (
            <Link
              key={tab.grouping}
              to={userPath(profile, tab.path)}
              aria-current={active ? "page" : undefined}
              className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                active
                  ? "border-violet-500 text-violet-300"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {/* ── Reviews ── */}
      {groups.length === 0 ? (
        <div className="card p-10 text-center space-y-2">
          <p className="text-3xl">✍️</p>
          <p className="text-gray-400">
            {isOwnProfile ? "You haven't written any reviews yet." : "No reviews yet."}
          </p>
        </div>
      ) : (
        <GroupedReviewList groups={groups} showGroupAverage={grouping === "year"} />
      )}
    </div>
  );
}
