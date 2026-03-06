import { useParams, Link } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { GET_USER_PROFILE } from "../graphql/queries";
import { useAuth } from "../contexts/AuthContext";

interface ProfileReview {
  id: string;
  rating: number;
  content: string;
  createdAt: string;
  game?: {
    id: string;
    title: string;
    coverUrl?: string | null;
    releaseYear?: number | null;
    genre?: string | null;
  } | null;
  comments?: { id: string }[];
}

interface UserProfile {
  id: string;
  username: string;
  createdAt?: string | null;
  reviews?: ProfileReview[];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function memberSince(iso?: string | null): string {
  if (!iso) return "Unknown";
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function ratingColor(r: number): string {
  if (r >= 8) return "text-emerald-400";
  if (r >= 6) return "text-amber-400";
  return "text-red-400";
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

export function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user: me } = useAuth();

  const { data, loading, error } = useQuery<{ user: UserProfile | null }>(
    GET_USER_PROFILE,
    { variables: { id }, skip: !id }
  );

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="card p-6 flex items-center gap-5 animate-pulse">
          <div className="w-16 h-16 rounded-full bg-gray-800 shrink-0" />
          <div className="space-y-2 flex-1">
            <div className="h-5 bg-gray-800 rounded w-40" />
            <div className="h-3 bg-gray-800 rounded w-28" />
          </div>
        </div>
        {/* Review skeletons */}
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card overflow-hidden flex animate-pulse h-28">
            <div className="w-20 bg-gray-800 shrink-0" />
            <div className="flex-1 p-4 space-y-2">
              <div className="h-4 bg-gray-800 rounded w-2/3" />
              <div className="h-3 bg-gray-800 rounded w-1/4" />
              <div className="h-8 bg-gray-800 rounded" />
            </div>
          </div>
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
  const reviews = [...(profile.reviews ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const isOwnProfile = me?.id === profile.id;
  const avgRating = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : null;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* ── Profile header ── */}
      <div className="card p-6 flex flex-col sm:flex-row items-center sm:items-start gap-5">
        <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${avatarGradient(profile.username)} flex items-center justify-center text-2xl font-black text-white shrink-0`}>
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
          </div>
          <p className="text-sm text-gray-500">Member since {memberSince(profile.createdAt)}</p>
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 pt-2">
            <div className="text-center">
              <p className="text-lg font-bold text-gray-100">{reviews.length}</p>
              <p className="text-xs text-gray-500">{reviews.length === 1 ? "review" : "reviews"}</p>
            </div>
            {avgRating !== null && (
              <div className="text-center">
                <p className={`text-lg font-bold ${ratingColor(avgRating)}`}>{avgRating.toFixed(1)}</p>
                <p className="text-xs text-gray-500">avg rating</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Reviews list ── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          {isOwnProfile ? "Your reviews" : `Reviews by ${profile.username}`}
        </h2>

        {reviews.length === 0 ? (
          <div className="card p-10 text-center space-y-2">
            <p className="text-3xl">✍️</p>
            <p className="text-gray-400">
              {isOwnProfile ? "You haven't written any reviews yet." : "No reviews yet."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map(review => {
              const game = review.game;
              const EXCERPT = 180;
              const excerpt = review.content.length > EXCERPT
                ? review.content.slice(0, EXCERPT).trimEnd() + "…"
                : review.content;

              return (
                <Link
                  key={review.id}
                  to={game ? `/games/${game.id}` : "/"}
                  className="group block"
                >
                  <article className="card overflow-hidden flex hover:border-violet-700 hover:shadow-lg hover:shadow-violet-900/20 transition-all duration-200">
                    {/* Cover */}
                    <div className="w-20 sm:w-28 shrink-0 relative overflow-hidden">
                      {game?.coverUrl ? (
                        <img
                          src={game.coverUrl}
                          alt={game.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-b from-gray-800 to-gray-900 flex items-center justify-center">
                          <span className="text-2xl opacity-20">🎮</span>
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-4 min-w-0 flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-100 group-hover:text-violet-300 transition-colors truncate text-sm">
                          {game?.title ?? "Unknown Game"}
                        </span>
                        {game?.releaseYear && (
                          <span className="text-xs text-gray-600 shrink-0">{game.releaseYear}</span>
                        )}
                      </div>

                      <div className="flex items-baseline gap-1">
                        <span className={`text-xl font-extrabold ${ratingColor(review.rating)}`}>
                          {review.rating.toFixed(1)}
                        </span>
                        <span className="text-xs text-gray-600">/ 10</span>
                      </div>

                      <p className="text-xs text-gray-400 leading-relaxed flex-1">{excerpt}</p>

                      <div className="flex items-center gap-3 pt-1 border-t border-gray-800/60">
                        <span className="text-xs text-gray-600">{timeAgo(review.createdAt)}</span>
                        {(review.comments?.length ?? 0) > 0 && (
                          <span className="text-xs text-gray-600 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            {review.comments?.length}
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
