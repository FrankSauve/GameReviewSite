import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@apollo/client";
import { GET_RAWG_GAME } from "../graphql/queries";
import type { ExternalGame } from "../types";
import { gamePath } from "../lib/links";
import { GameHeader } from "../components/GameHeader";
import { AddReviewForm } from "../components/AddReviewForm";

/**
 * A RAWG title nobody has reviewed yet. Nothing is in the library until the
 * review is submitted: the game and its first review are written together.
 */
export function NewGamePage() {
  const { rawgId = "" } = useParams<{ rawgId: string }>();
  const navigate = useNavigate();
  const { data, loading, error } = useQuery<{
    rawgGame: ExternalGame | null;
  }>(GET_RAWG_GAME, { variables: { rawgId }, skip: !rawgId });

  if (loading && !data)
    return (
      <div className="page-column animate-pulse">
        <div className="card p-card-pad h-40" />
      </div>
    );
  if (error && !data)
    return (
      <div className="text-center py-20">
        <p className="text-danger-text">{error.message}</p>
      </div>
    );

  const preview = data?.rawgGame;
  if (!preview)
    return (
      <div className="text-center py-20">
        <p className="text-content-subtle">Game not found.</p>
      </div>
    );
  if (preview.game) return <Navigate to={gamePath(preview.game)} replace />;

  return (
    <div className="space-y-8 page-column">
      <Link
        to="/games"
        className="inline-flex items-center gap-1.5 text-meta text-content-subtle hover:text-content-body transition-colors duration-theme"
      >
        ← All Games
      </Link>

      <GameHeader game={preview} />

      <div className="card p-card-pad">
        <h2 className="font-semibold text-content mb-1">Your Review</h2>
        <p className="text-meta text-content-subtle mb-4">
          The game joins the library with your review.
        </p>
        <AddReviewForm
          target={{ rawgId: preview.rawgId }}
          gameGenres={preview.genres}
          onSuccess={(game) => void navigate(gamePath(game), { replace: true })}
        />
      </div>
    </div>
  );
}
