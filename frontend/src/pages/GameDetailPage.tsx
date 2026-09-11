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
import { GameCover } from "../components/GameCover";
import { LabelChips } from "../components/LabelChips";
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
        className="inline-flex items-center gap-1.5 text-sm text-content-subtle hover:text-content-body transition-colors duration-theme"
      >
        <BackIcon /> All Games
      </Link>

      {/* Game header */}
      <div className="card overflow-hidden">
        {/* Cover hero */}
        {game.coverUrl ? (
          <div className="relative h-56 sm:h-72 overflow-hidden">
            <GameCover game={game} size="lg" eager />
            <div className="absolute inset-0 bg-gradient-to-t from-scrim via-scrim/40 to-transparent" />
            {/* Title overlaid on cover */}
            <div className="absolute bottom-0 left-0 p-6">
              <h1 className="font-display text-3xl text-accent-contrast drop-shadow-lg">
                {game.title}
              </h1>
            </div>
          </div>
        ) : null}

        <div className="p-6 space-y-4">
          {!game.coverUrl && (
            <h1 className="font-display text-3xl text-content">{game.title}</h1>
          )}

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <LabelChips
                labels={game.genres}
                className="text-xs font-medium bg-accent-subtle/50 text-accent-subtle-text px-2.5 py-1 rounded-pill border border-accent-subtle-border"
              />
              {game.releaseYear && (
                <span className="text-sm text-content-subtle">
                  {game.releaseYear}
                </span>
              )}
            </div>

            {game.averageRating != null && (
              <div className="card px-5 py-4 text-center shrink-0">
                <p
                  className={`font-numeric text-4xl font-extrabold ${ratingColor(game.averageRating)}`}
                >
                  {formatRating(game.averageRating)}
                </p>
                <p className="text-xs text-content-subtle mt-1">out of 10</p>
                <p className="text-xs text-content-faint mt-1">
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
          <h2 className="font-display text-xl text-content">
            Reviews{" "}
            <span className="text-content-faint font-normal text-base">
              ({reviews.length})
            </span>
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
            <h3 className="font-semibold text-content mb-4">Your Review</h3>
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
            <p className="text-sm text-content-subtle">
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
            <p className="text-sm text-content-subtle">
              You've already reviewed this game.
            </p>
          </div>
        )}

        {reviews.length === 0 ? (
          <div className="text-center py-12 card">
            <p className="text-4xl mb-3">🎮</p>
            <p className="text-content-subtle">No reviews yet. Be the first!</p>
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
  const displayed =
    isLong && !expanded
      ? description.slice(0, DESCRIPTION_LIMIT).trimEnd() + "…"
      : description;

  return (
    <div className="border-t border-line pt-4 space-y-2">
      <div ref={ref}>
        <p className="text-content-muted text-sm leading-relaxed">
          {displayed}
        </p>
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-accent-subtle-text hover:text-accent-subtle-text transition-colors duration-theme"
        >
          {expanded ? "Show less ↑" : "Show more ↓"}
        </button>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6 page-column animate-pulse">
      <div className="h-4 skeleton-bar w-24" />
      <div className="card p-6 space-y-4">
        <div className="h-8 skeleton-bar w-2/3" />
        <div className="h-4 skeleton-bar w-1/3" />
        <div className="h-16 skeleton-bar" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="card p-5 space-y-3">
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
