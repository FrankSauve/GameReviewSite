import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@apollo/client/react";
import { GET_EXTERNAL_GAME } from "../graphql/queries";
import type { ExternalGame } from "../types";
import { gamePath, sourceFromPath } from "../lib/links";
import { GameHeader } from "../components/GameHeader";
import { AddReviewForm } from "../components/AddReviewForm";

/**
 * A title from a game source that nobody has reviewed yet. Nothing is in the library until the
 * review is submitted: the game and its first review are written together.
 */
export function NewGamePage() {
  const params = useParams<{ source: string; id: string }>();
  const source = sourceFromPath(params.source ?? "");
  const id = params.id ?? "";
  const navigate = useNavigate();
  // By path: the route keeps this page mounted from one new game to the next.
  const path = `${params.source}/${id}`;
  const [different, setDifferent] = useState<string | null>(null);
  const { data, loading, error } = useQuery<{
    externalGame: ExternalGame | null;
  }>(GET_EXTERNAL_GAME, { variables: { source, id }, skip: !source || !id });

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

  const preview = data?.externalGame;
  const match = preview?.libraryMatch;
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

      {match && different !== path ? (
        <div className="card p-card-pad space-y-3">
          <h2 className="font-semibold text-content">
            Already in the library?
          </h2>
          <p className="text-meta text-content-subtle">
            This looks like {match.title}
            {match.releaseYear ? ` (${match.releaseYear})` : ""}, which is
            already here.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to={gamePath(match)} className="btn-primary text-meta">
              Review that game
            </Link>
            <button
              onClick={() => setDifferent(path)}
              className="btn-secondary text-meta"
            >
              This is a different game
            </button>
          </div>
        </div>
      ) : (
        <div className="card p-card-pad">
          <h2 className="font-semibold text-content mb-1">Your Review</h2>
          <p className="text-meta text-content-subtle mb-4">
            The game joins the library with your review.
          </p>
          <AddReviewForm
            target={{ source: preview.source, externalId: preview.externalId }}
            gameGenres={preview.genres}
            onSuccess={(game) =>
              void navigate(gamePath(game), { replace: true })
            }
          />
        </div>
      )}
    </div>
  );
}
