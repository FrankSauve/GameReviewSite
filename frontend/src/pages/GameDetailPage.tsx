import { useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { GET_GAME } from "../graphql/queries";
import { ReviewCard } from "../components/ReviewCard";
import { AddReviewForm } from "../components/AddReviewForm";
import { useAuth } from "../contexts/AuthContext";
import type { Game } from "../types";
import { formatRating, ratingColor } from "../lib/rating";
import { gamePath } from "../lib/links";
import { useCanonicalPath } from "../hooks/useCanonicalPath";

export function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, signIn } = useAuth();
  const [showReviewForm, setShowReviewForm] = useState(false);

  const { data, loading, error } = useQuery<{ game: Game | null }>(GET_GAME, {
    variables: { id },
    skip: !id,
  });

  useCanonicalPath(data?.game ? gamePath(data.game) : null);

  if (loading) return <DetailSkeleton />;
  if (error)
    return (
      <div className="text-center py-20">
        <p className="text-red-400">{error.message}</p>
      </div>
    );

  const game = data?.game;
  if (!game)
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Game not found.</p>
      </div>
    );

  const reviews = game.reviews ?? [];
  const hasReviewed = user ? reviews.some((r) => r.user?.id === user.id) : false;

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
      >
        <BackIcon /> All Games
      </Link>

      {/* Game header */}
      <div className="card overflow-hidden">
        {/* Cover hero */}
        {game.coverUrl ? (
          <div className="relative h-56 sm:h-72 overflow-hidden">
            <img
              src={game.coverUrl}
              alt={game.title}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/40 to-transparent" />
            {/* Title overlaid on cover */}
            <div className="absolute bottom-0 left-0 p-6">
              <h1 className="text-3xl font-extrabold text-white drop-shadow-lg">
                {game.title}
              </h1>
            </div>
          </div>
        ) : null}

        <div className="p-6 space-y-4">
          {!game.coverUrl && (
            <h1 className="text-3xl font-extrabold text-gray-100">{game.title}</h1>
          )}

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {game.genre && (
                <span className="text-xs font-medium bg-violet-900/50 text-violet-300 px-2.5 py-1 rounded-full border border-violet-800">
                  {game.genre}
                </span>
              )}
              {game.platform && (
                <span className="text-xs font-medium bg-gray-800 text-gray-300 px-2.5 py-1 rounded-full border border-gray-700">
                  {game.platform.split(",")[0]}
                </span>
              )}
              {game.releaseYear && (
                <span className="text-sm text-gray-500">{game.releaseYear}</span>
              )}
            </div>

            {game.averageRating != null && (
              <div className="card px-5 py-4 text-center shrink-0">
                <p className={`text-4xl font-extrabold ${ratingColor(game.averageRating)}`}>
                  {formatRating(game.averageRating)}
                </p>
                <p className="text-xs text-gray-500 mt-1">out of 10</p>
                <p className="text-xs text-gray-600 mt-1">
                  {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
                </p>
              </div>
            )}
          </div>

          {game.description && (
            <GameDescription description={game.description} />
          )}
        </div>
      </div>

      {/* Reviews section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-100">
            Reviews{" "}
            <span className="text-gray-600 font-normal text-base">({reviews.length})</span>
          </h2>

          {user && !hasReviewed && !showReviewForm && (
            <button
              onClick={() => setShowReviewForm(true)}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <PenIcon /> Write a Review
            </button>
          )}
        </div>

        {/* Review form */}
        {showReviewForm && user && (
          <div className="card p-5 mb-4">
            <h3 className="font-semibold text-gray-200 mb-4">Your Review</h3>
            <AddReviewForm
              gameId={game.id}
              onSuccess={() => setShowReviewForm(false)}
            />
          </div>
        )}

        {/* Not logged in nudge */}
        {!user && (
          <div className="card p-4 mb-4 flex items-center gap-3 border-dashed">
            <span className="text-2xl">🔐</span>
            <p className="text-sm text-gray-500">
              <button
                onClick={() => signIn(gamePath(game))}
                className="text-violet-400 hover:text-violet-300 font-medium transition-colors"
              >
                Sign in
              </button>{" "}
              to write a review.
            </p>
          </div>
        )}

        {/* Already reviewed */}
        {user && hasReviewed && !showReviewForm && (
          <div className="card p-4 mb-4 flex items-center gap-3 border-dashed border-gray-700">
            <span className="text-lg">✅</span>
            <p className="text-sm text-gray-500">You've already reviewed this game.</p>
          </div>
        )}

        {reviews.length === 0 ? (
          <div className="text-center py-12 card">
            <p className="text-4xl mb-3">🎮</p>
            <p className="text-gray-500">No reviews yet. Be the first!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => (
              <ReviewCard key={review.id} review={review} gameId={game.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const DESCRIPTION_LIMIT = 400;

function GameDescription({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isLong = description.length > DESCRIPTION_LIMIT;
  const displayed = isLong && !expanded
    ? description.slice(0, DESCRIPTION_LIMIT).trimEnd() + "…"
    : description;

  return (
    <div className="border-t border-gray-800 pt-4 space-y-2">
      <div ref={ref}>
        <p className="text-gray-400 text-sm leading-relaxed">{displayed}</p>
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
        >
          {expanded ? "Show less ↑" : "Show more ↓"}
        </button>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6 max-w-3xl mx-auto animate-pulse">
      <div className="h-4 bg-gray-800 rounded w-24" />
      <div className="card p-6 space-y-4">
        <div className="h-8 bg-gray-800 rounded w-2/3" />
        <div className="h-4 bg-gray-800 rounded w-1/3" />
        <div className="h-16 bg-gray-800 rounded" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="card p-5 space-y-3">
          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-full bg-gray-800" />
            <div className="space-y-1.5 flex-1">
              <div className="h-3 bg-gray-800 rounded w-24" />
              <div className="h-3 bg-gray-800 rounded w-16" />
            </div>
          </div>
          <div className="h-12 bg-gray-800 rounded" />
        </div>
      ))}
    </div>
  );
}

function BackIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}
