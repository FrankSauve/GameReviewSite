import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { GET_GAME } from "../graphql/queries";
import { ReviewCard } from "../components/ReviewCard";
import { AddReviewForm } from "../components/AddReviewForm";
import { useAuth } from "../contexts/AuthContext";
import type { Game } from "../types";
import { formatRating, ratingColor } from "../lib/rating";
import { gamePath } from "../lib/links";
import { GameHeader } from "../components/GameHeader";
import { useCanonicalPath } from "../hooks/useCanonicalPath";

export function GameDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, signIn } = useAuth();
  const [showReviewForm, setShowReviewForm] = useState(false);

  const { data, loading, error } = useQuery<{ game: Game | null }>(GET_GAME, {
    variables: { id },
    skip: !id,
    // Reviews land from other people's sessions, so a cached copy goes stale.
    fetchPolicy: "cache-and-network",
  });

  useCanonicalPath(data?.game ? gamePath(data.game) : null);

  if (loading && !data) return <DetailSkeleton />;
  // A failed background refresh keeps the cached page rather than replacing it.
  if (error && !data)
    return (
      <div className="text-center py-20">
        <p className="text-danger-text">{error.message}</p>
      </div>
    );

  const game = data?.game;
  if (!game)
    return (
      <div className="text-center py-20">
        <p className="text-content-subtle">Game not found.</p>
      </div>
    );

  const reviews = game.reviews ?? [];
  const hasReviewed = user
    ? reviews.some((r) => r.user?.id === user.id)
    : false;

  return (
    <div className="space-y-8 page-column">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-meta text-content-subtle hover:text-content-body transition-colors duration-theme"
      >
        <BackIcon /> All Games
      </Link>

      <GameHeader game={game}>
        {game.averageRating != null && (
          <div className="card px-5 py-4 text-center shrink-0">
            <p
              className={`font-numeric text-display font-extrabold ${ratingColor(game.averageRating)}`}
            >
              {formatRating(game.averageRating)}
            </p>
            <p className="text-micro text-content-subtle mt-1">out of 10</p>
            <p className="text-micro text-content-subtle mt-1">
              {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
            </p>
          </div>
        )}
      </GameHeader>

      {/* Reviews section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-title text-content">
            Reviews{" "}
            <span className="text-content-subtle font-normal text-body">
              ({reviews.length})
            </span>
          </h2>

          {user && !hasReviewed && !showReviewForm && (
            <button
              onClick={() => setShowReviewForm(true)}
              className="btn-primary flex items-center gap-2 text-meta"
            >
              <PenIcon /> Write a Review
            </button>
          )}
        </div>

        {/* Review form */}
        {showReviewForm && user && (
          <div className="card p-card-pad mb-4">
            <h3 className="font-semibold text-content mb-4">Your Review</h3>
            <AddReviewForm
              target={{ gameId: game.id }}
              gameGenres={game.genres}
              onSuccess={() => setShowReviewForm(false)}
            />
          </div>
        )}

        {/* Not logged in nudge */}
        {!user && (
          <div className="card p-4 mb-4 flex items-center gap-3 border-dashed">
            <span className="text-2xl">🔐</span>
            <p className="text-meta text-content-subtle">
              <button
                onClick={() => signIn(gamePath(game))}
                className="text-accent-subtle-text hover:text-accent-subtle-text font-medium transition-colors duration-theme"
              >
                Sign in
              </button>{" "}
              to write a review.
            </p>
          </div>
        )}

        {/* Already reviewed */}
        {user && hasReviewed && !showReviewForm && (
          <div className="card p-4 mb-4 flex items-center gap-3 border-dashed border-line-strong">
            <span className="text-lg">✅</span>
            <p className="text-meta text-content-subtle">
              You've already reviewed this game.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              gameId={game.id}
              last={reviews.length === 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6 page-column animate-pulse">
      <div className="h-4 skeleton-bar w-24" />
      <div className="card p-card-pad space-y-4">
        <div className="h-8 skeleton-bar w-2/3" />
        <div className="h-4 skeleton-bar w-1/3" />
        <div className="h-16 skeleton-bar" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="card p-card-pad space-y-3">
          <div className="flex gap-3">
            <div className="w-9 h-9 rounded-pill bg-surface-raised" />
            <div className="space-y-1.5 flex-1">
              <div className="h-3 skeleton-bar w-24" />
              <div className="h-3 skeleton-bar w-16" />
            </div>
          </div>
          <div className="h-12 skeleton-bar" />
        </div>
      ))}
    </div>
  );
}

function BackIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 19l-7-7 7-7"
      />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
      />
    </svg>
  );
}
