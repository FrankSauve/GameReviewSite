import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@apollo/client";
import { GET_RECENT_REVIEWS } from "../graphql/queries";
import { CREATE_COMMENT } from "../graphql/mutations";
import { useAuth } from "../contexts/AuthContext";
import type { Review } from "../types";
import { formatRating, ratingColor } from "../lib/rating";
import { excerpt } from "../lib/markdown";
import { formatPlaytime } from "../lib/playtime";
import { gamePath, reviewPath, userPath } from "../lib/links";
import { Pagination } from "../components/Pagination";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
  const idx =
    [...title].reduce((a, c) => a + c.charCodeAt(0), 0) % gradients.length;
  return gradients[idx];
}

// ─── Review feed card ────────────────────────────────────────────────────────

function ReviewFeedCard({ review }: { review: Review }) {
  const game = review.game;
  const navigate = useNavigate();
  const { user, signIn } = useAuth();
  const [showComments, setShowComments] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [localComments, setLocalComments] = useState(review.comments ?? []);

  const [createComment, { loading: submitting }] = useMutation(CREATE_COMMENT, {
    onCompleted(data) {
      setLocalComments((prev) => [...prev, data.createComment]);
      setNewComment("");
    },
  });

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newComment.trim();
    if (!trimmed || submitting) return;
    void createComment({
      variables: { input: { reviewId: review.id, content: trimmed } },
    });
  };

  const summary = excerpt(review.content, 220);

  return (
    <article className="card overflow-hidden flex flex-col hover:border-violet-700 hover:shadow-lg hover:shadow-violet-900/20 transition-all duration-200">
      {/* Main clickable row */}
      <button
        onClick={() => void navigate(reviewPath(review))}
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
            <div
              className={`w-full h-full bg-gradient-to-b ${titleGradient(game?.title ?? "")} flex items-center justify-center`}
            >
              <span className="text-3xl opacity-30">🎮</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-4 min-w-0 flex flex-col gap-2">
          {/* Game title + meta */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={gamePath(game)}
              onClick={(e) => e.stopPropagation()}
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
            <span
              className={`text-2xl font-extrabold ${ratingColor(review.rating)}`}
            >
              {formatRating(review.rating)}
            </span>
            <span className="text-sm text-gray-600">/ 10</span>
          </div>

          {/* Excerpt */}
          <p className="text-sm text-gray-400 leading-relaxed flex-1">
            {summary}
          </p>

          {/* Footer: reviewer + time */}
          <div className="flex items-center gap-2 pt-1 border-t border-gray-800/60">
            <span className="w-6 h-6 rounded-full bg-violet-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
              {(review.user?.username ?? "?")[0].toUpperCase()}
            </span>
            <Link
              to={userPath(review.user)}
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-medium text-violet-400 hover:text-violet-300 transition-colors"
            >
              {review.user?.username ?? "Anonymous"}
            </Link>
            <span className="text-xs text-gray-600 ml-auto shrink-0">
              {formatPlaytime(review.yearPlayed, review.hoursPlayed) ??
                timeAgo(review.createdAt)}
            </span>
          </div>
        </div>
      </button>

      {/* Comments section */}
      <div className="px-4 pb-3 border-t border-gray-800/60">
        {/* Toggle button */}
        <button
          onClick={() => setShowComments((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors pt-2.5"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          {localComments.length}{" "}
          {localComments.length === 1 ? "comment" : "comments"}
          <svg
            className={`w-3 h-3 transition-transform ${showComments ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {showComments && (
          <div className="mt-2 space-y-3">
            {/* Existing comments */}
            {localComments.length > 0 && (
              <div className="space-y-2 pl-3 border-l-2 border-gray-800">
                {localComments.map((comment) => (
                  <div key={comment.id} className="flex gap-2">
                    <span className="w-5 h-5 rounded-full bg-gradient-to-br from-emerald-700 to-teal-800 flex items-center justify-center text-xs font-bold text-white shrink-0 mt-0.5">
                      {(comment.user?.username ?? "?")[0].toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-gray-300">
                        {comment.user?.username ?? "Unknown"}
                      </span>
                      <span className="text-xs text-gray-600 ml-2">
                        {timeAgo(comment.createdAt)}
                      </span>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {comment.content}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add comment form (logged-in users only) */}
            {user ? (
              <form
                onSubmit={handleSubmitComment}
                className="flex items-center gap-2 pt-1"
              >
                <span className="w-6 h-6 rounded-full bg-violet-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                  {user.username[0].toUpperCase()}
                </span>
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
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
                <button
                  onClick={() => signIn()}
                  className="text-violet-400 hover:text-violet-300 transition-colors"
                >
                  Sign in
                </button>{" "}
                to leave a comment.
              </p>
            )}
          </div>
        )}
      </div>
    </article>
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

export function HomePage() {
  const [page, setPage] = useState(0);

  const { data: reviewsData, loading: reviewsLoading } = useQuery<{
    recentReviews: Review[];
    recentReviewsCount: number;
  }>(GET_RECENT_REVIEWS, {
    variables: { limit: PAGE_SIZE, offset: page * PAGE_SIZE },
    fetchPolicy: "network-only",
  });

  const reviews = reviewsData?.recentReviews ?? [];
  const totalReviews = reviewsData?.recentReviewsCount ?? 0;
  const totalPages = Math.ceil(totalReviews / PAGE_SIZE);

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
              Search for a game in the navbar, then be the first to leave a
              review.
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

            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
              label="Recent review pages"
            />
          </>
        )}
      </section>
    </div>
  );
}
