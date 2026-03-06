import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@apollo/client";
import { GET_RECENT_REVIEWS, GET_GAMES } from "../graphql/queries";
import { CREATE_COMMENT } from "../graphql/mutations";
import { useAuth } from "../contexts/AuthContext";
import type { Review, Game } from "../types";

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

function ratingColor(r: number): string {
  if (r >= 8) return "text-emerald-400";
  if (r >= 6) return "text-amber-400";
  return "text-red-400";
}

function genreColor(genre?: string | null): string {
  const map: Record<string, string> = {
    RPG: "bg-violet-900/60 text-violet-300 border-violet-800",
    "Action RPG": "bg-violet-900/60 text-violet-300 border-violet-800",
    Action: "bg-red-900/60 text-red-300 border-red-800",
    Adventure: "bg-emerald-900/60 text-emerald-300 border-emerald-800",
    Strategy: "bg-blue-900/60 text-blue-300 border-blue-800",
    Shooter: "bg-orange-900/60 text-orange-300 border-orange-800",
    Sports: "bg-cyan-900/60 text-cyan-300 border-cyan-800",
    Horror: "bg-rose-900/60 text-rose-300 border-rose-800",
  };
  return map[genre ?? ""] ?? "bg-gray-800 text-gray-400 border-gray-700";
}

function titleGradient(title: string): string {
  const gradients = [
    "from-violet-900 to-indigo-900",
    "from-rose-900 to-pink-900",
    "from-emerald-900 to-teal-900",
    "from-blue-900 to-cyan-900",
    "from-amber-900 to-orange-900",
    "from-fuchsia-900 to-purple-900",
  ];
  const idx = [...title].reduce((a, c) => a + c.charCodeAt(0), 0) % gradients.length;
  return gradients[idx];
}

// ─── Review feed card ────────────────────────────────────────────────────────

function ReviewFeedCard({ review }: { review: Review }) {
  const game = review.game;
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [localComments, setLocalComments] = useState(review.comments ?? []);

  const [createComment, { loading: submitting }] = useMutation(CREATE_COMMENT, {
    onCompleted(data) {
      setLocalComments(prev => [...prev, data.createComment]);
      setNewComment("");
    },
  });

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newComment.trim();
    if (!trimmed || submitting) return;
    createComment({ variables: { input: { reviewId: review.id, content: trimmed } } });
  };

  const EXCERPT_LEN = 220;
  const excerpt = review.content.length > EXCERPT_LEN
    ? review.content.slice(0, EXCERPT_LEN).trimEnd() + "…"
    : review.content;

  return (
    <article className="card overflow-hidden flex flex-col hover:border-violet-700 hover:shadow-lg hover:shadow-violet-900/20 transition-all duration-200">
      {/* Main clickable row */}
      <button
        onClick={() => navigate(`/reviews/${review.id}`)}
        className="flex gap-0 text-left group w-full"
      >
        {/* Cover art */}
        <div className="w-28 sm:w-36 shrink-0 relative overflow-hidden">
          {game?.coverUrl ? (
            <img
              src={game.coverUrl}
              alt={game.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className={`w-full h-full bg-gradient-to-b ${titleGradient(game?.title ?? "")} flex items-center justify-center`}>
              <span className="text-3xl opacity-30">🎮</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-4 min-w-0 flex flex-col gap-2">
          {/* Game title + meta */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={game ? `/games/${game.id}` : "/"}
              onClick={e => e.stopPropagation()}
              className="font-bold text-gray-100 hover:text-violet-300 transition-colors truncate"
            >
              {game?.title ?? "Unknown Game"}
            </Link>
            {game?.releaseYear && (
              <span className="text-xs text-gray-600">{game.releaseYear}</span>
            )}
          </div>

          {/* Score out of 10 */}
          <div className="flex items-baseline gap-1">
            <span className={`text-2xl font-extrabold ${ratingColor(review.rating)}`}>
              {review.rating.toFixed(1)}
            </span>
            <span className="text-sm text-gray-600">/ 10</span>
          </div>

          {/* Excerpt */}
          <p className="text-sm text-gray-400 leading-relaxed flex-1">
            {excerpt}
          </p>

          {/* Footer: reviewer + time */}
          <div className="flex items-center gap-2 pt-1 border-t border-gray-800/60">
            <span className="w-6 h-6 rounded-full bg-violet-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {(review.user?.username ?? "?")[0].toUpperCase()}
            </span>
            <Link
              to={review.user ? `/users/${review.user.id}` : "#"}
              onClick={e => e.stopPropagation()}
              className="text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors"
            >
              {review.user?.username ?? "Anonymous"}
            </Link>
            <span className="text-xs text-gray-600 ml-auto shrink-0">
              {timeAgo(review.createdAt)}
            </span>
          </div>
        </div>
      </button>

      {/* Comments section */}
      <div className="px-4 pb-3 border-t border-gray-800/60">
        {/* Toggle button */}
        <button
          onClick={() => setShowComments(v => !v)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors pt-2.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {localComments.length} {localComments.length === 1 ? "comment" : "comments"}
          <svg className={`w-3 h-3 transition-transform ${showComments ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showComments && (
          <div className="mt-2 space-y-3">
            {/* Existing comments */}
            {localComments.length > 0 && (
              <div className="space-y-2 pl-3 border-l-2 border-gray-800">
                {localComments.map(comment => (
                  <div key={comment.id} className="flex gap-2">
                    <span className="w-5 h-5 rounded-full bg-gradient-to-br from-emerald-700 to-teal-800 flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5">
                      {(comment.user?.username ?? "?")[0].toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-gray-300">{comment.user?.username ?? "Unknown"}</span>
                      <span className="text-xs text-gray-600 ml-2">{timeAgo(comment.createdAt)}</span>
                      <p className="text-xs text-gray-400 mt-0.5">{comment.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add comment form (logged-in users only) */}
            {user ? (
              <form onSubmit={handleSubmitComment} className="flex items-center gap-2 pt-1">
                <span className="w-6 h-6 rounded-full bg-violet-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                  {user.username[0].toUpperCase()}
                </span>
                <input
                  type="text"
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="Add a comment…"
                  maxLength={500}
                  disabled={submitting}
                  className="flex-1 bg-gray-800/60 border border-gray-700 rounded-full px-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600 disabled:opacity-50 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!newComment.trim() || submitting}
                  className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-full transition-colors"
                >
                  {submitting ? "…" : "Post"}
                </button>
              </form>
            ) : (
              <p className="text-xs text-gray-600 pt-1 pl-1">
                <Link to="/login" className="text-violet-400 hover:text-violet-300 transition-colors">Log in</Link> to leave a comment.
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// ─── Compact game card for the library strip ─────────────────────────────────

function GameStrip({ game }: { game: Game }) {
  return (
    <Link to={`/games/${game.id}`} className="group block">
      <div className="card overflow-hidden hover:border-violet-700 transition-all duration-200">
        <div className="relative h-32 overflow-hidden">
          {game.coverUrl ? (
            <>
              <img
                src={game.coverUrl}
                alt={game.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 to-transparent" />
            </>
          ) : (
            <div className={`w-full h-full bg-gradient-to-br ${titleGradient(game.title)}`} />
          )}
          {game.averageRating != null && (
            <span className={`absolute bottom-2 right-2 text-sm font-black drop-shadow ${ratingColor(game.averageRating)}`}>
              {game.averageRating.toFixed(1)}
            </span>
          )}
        </div>
        <div className="p-3">
          <p className="text-xs font-semibold text-gray-200 line-clamp-1 group-hover:text-violet-300 transition-colors">
            {game.title}
          </p>
          {game.releaseYear && (
            <p className="text-xs text-gray-600 mt-0.5">{game.releaseYear}</p>
          )}
        </div>
      </div>
    </Link>
  );
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function ReviewFeedSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="card overflow-hidden flex animate-pulse h-36">
          <div className="w-28 sm:w-36 bg-gray-800 shrink-0" />
          <div className="flex-1 p-4 space-y-3">
            <div className="h-4 bg-gray-800 rounded w-2/3" />
            <div className="h-3 bg-gray-800 rounded w-1/4" />
            <div className="h-12 bg-gray-800 rounded" />
            <div className="h-3 bg-gray-800 rounded w-1/3 mt-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

export function GamesPage() {
  const [showAllGames, setShowAllGames] = useState(false);
  const [page, setPage] = useState(0);

  const { data: reviewsData, loading: reviewsLoading } = useQuery<{ recentReviews: Review[]; recentReviewsCount: number }>(
    GET_RECENT_REVIEWS,
    { variables: { limit: PAGE_SIZE, offset: page * PAGE_SIZE }, fetchPolicy: "network-only" }
  );

  const { data: gamesData, loading: gamesLoading } = useQuery<{ games: Game[] }>(GET_GAMES);

  const reviews = reviewsData?.recentReviews ?? [];
  const totalReviews = reviewsData?.recentReviewsCount ?? 0;
  const totalPages = Math.ceil(totalReviews / PAGE_SIZE);
  const games = (gamesData?.games ?? []).filter(g => (g.reviews?.length ?? 0) > 0);
  const visibleGames = showAllGames ? games : games.slice(0, 12);

  return (
    <div className="space-y-10">

      {/* ── Recent Reviews ───────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
            <span className="w-1 h-5 bg-violet-500 rounded-full inline-block" />
            Recent Reviews
          </h2>
          {totalReviews > 0 && (
            <span className="text-xs text-gray-600">{totalReviews} total</span>
          )}
        </div>

        {reviewsLoading && <ReviewFeedSkeleton />}

        {!reviewsLoading && reviews.length === 0 && (
          <div className="card p-12 text-center space-y-3">
            <p className="text-4xl">✍️</p>
            <p className="text-gray-400 font-medium">No reviews yet</p>
            <p className="text-sm text-gray-600">
              Search for a game in the navbar, then be the first to leave a review.
            </p>
          </div>
        )}

        {!reviewsLoading && reviews.length > 0 && (
          <>
            <div className="space-y-3">
              {reviews.map((review) => (
                <ReviewFeedCard key={review.id} review={review} />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <button
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 0}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ← Prev
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setPage(i)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                        i === page
                          ? "bg-violet-600 text-white"
                          : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Games Library ────────────────────────────────────────────── */}
      {(gamesLoading || games.length > 0) && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-100 flex items-center gap-2">
              <span className="w-1 h-5 bg-violet-500 rounded-full inline-block" />
              Games Library
            </h2>
            {games.length > 0 && (
              <span className="text-xs text-gray-600">{games.length} {games.length === 1 ? "game" : "games"}</span>
            )}
          </div>

          {gamesLoading && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="card overflow-hidden animate-pulse">
                  <div className="h-32 bg-gray-800" />
                  <div className="p-3 space-y-1.5">
                    <div className="h-3 bg-gray-800 rounded" />
                    <div className="h-2 bg-gray-800 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!gamesLoading && (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {visibleGames.map((game) => (
                  <GameStrip key={game.id} game={game} />
                ))}
              </div>

              {games.length > 12 && (
                <button
                  onClick={() => setShowAllGames((v) => !v)}
                  className="mt-4 text-sm text-violet-400 hover:text-violet-300 transition-colors"
                >
                  {showAllGames ? "Show less" : `Show all ${games.length} games`}
                </button>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
