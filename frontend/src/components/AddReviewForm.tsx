import { useId, useState } from "react";
import { useMutation } from "@apollo/client/react";
import { CREATE_REVIEW } from "../graphql/mutations";
import { GET_GAME } from "../graphql/queries";
import { useAuth } from "../contexts/AuthContext";
import { currentYear, snapHours } from "../lib/playtime";
import { RatingInput } from "./RatingInput";
import { PlaytimeInput } from "./PlaytimeInput";
import { PlatformSelect } from "./PlatformSelect";
import { GenreInput } from "./GenreInput";
import { SecondaryGenresInput } from "./SecondaryGenresInput";
import { DEFAULT_PLATFORM } from "../lib/platforms";
import { MarkdownEditor } from "./MarkdownEditor";
import { errorMessage } from "../lib/errorMessage";

interface AddReviewFormProps {
  /** A game in the library, or a RAWG title its first review will add. */
  target: { gameId: string } | { rawgId: string };
  gameGenres?: string[] | undefined;
  communityGenres?: string[] | undefined;
  communitySecondaryGenres?: string[] | undefined;
  onSuccess?: (game: { id: string; slug?: string | null }) => void;
}

interface CreateReviewResult {
  createReview: { game: { id: string; slug?: string | null } };
}

const DEFAULT_RATING = 8;

export function AddReviewForm({
  target,
  gameGenres,
  communityGenres,
  communitySecondaryGenres,
  onSuccess,
}: AddReviewFormProps) {
  const { user, signIn } = useAuth();
  const bodyId = useId();
  const [content, setContent] = useState("");
  const [rating, setRating] = useState<number>(DEFAULT_RATING);
  const [yearPlayed, setYearPlayed] = useState<number>(currentYear());
  const [hoursPlayed, setHoursPlayed] = useState("");
  const [platform, setPlatform] = useState(DEFAULT_PLATFORM);
  const [genre, setGenre] = useState("");
  const [secondaryGenres, setSecondaryGenres] = useState<string[]>([]);

  const [createReview, { loading, error }] = useMutation<CreateReviewResult>(
    CREATE_REVIEW,
    {
      refetchQueries:
        "gameId" in target
          ? [{ query: GET_GAME, variables: { id: target.gameId } }]
          : [],
      // The profile reads these as ReviewSummary, a separate cache entity this write does not touch.
      // Evicted rather than refetched: the library is not mounted while this form is.
      update: (cache) => {
        for (const fieldName of [
          "reviewSummariesByUser",
          "games",
          "gamesCount",
        ])
          cache.evict({ id: "ROOT_QUERY", fieldName });
      },
      onCompleted: (data) => {
        setContent("");
        setRating(DEFAULT_RATING);
        setYearPlayed(currentYear());
        setHoursPlayed("");
        setPlatform(DEFAULT_PLATFORM);
        setGenre("");
        setSecondaryGenres([]);
        onSuccess?.(data.createReview.game);
      },
    },
  );

  if (!user) {
    return (
      <p className="text-meta text-content-subtle">
        <button
          onClick={() => signIn()}
          className="text-accent-subtle-text hover:text-accent-subtle-text font-medium"
        >
          Sign in
        </button>{" "}
        to write a review.
      </p>
    );
  }

  const hours = Number(hoursPlayed);
  const hoursValid =
    hoursPlayed.trim() !== "" && Number.isFinite(hours) && hours > 0;
  const canSubmit = content.trim() !== "" && hoursValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    void createReview({
      variables: {
        input: {
          ...target,
          rating,
          content: content.trim(),
          yearPlayed,
          hoursPlayed: snapHours(hours),
          platform: platform || null,
          genre: genre.trim() || null,
          secondaryGenres,
        },
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-body font-medium text-content-muted mb-2">
          Your Rating
        </label>
        <RatingInput value={rating} onChange={setRating} />
      </div>

      <PlaytimeInput
        year={yearPlayed}
        hours={hoursPlayed}
        onYearChange={setYearPlayed}
        onHoursChange={setHoursPlayed}
      />

      <PlatformSelect value={platform} onChange={setPlatform} />

      <GenreInput
        value={genre}
        onChange={setGenre}
        gameGenres={gameGenres}
        communityGenres={communityGenres}
        communitySecondaryGenres={communitySecondaryGenres}
      />

      <SecondaryGenresInput
        value={secondaryGenres}
        onChange={setSecondaryGenres}
        genre={genre}
        gameGenres={gameGenres}
        communityGenres={communityGenres}
        communitySecondaryGenres={communitySecondaryGenres}
      />

      <div>
        <label htmlFor={bodyId} className="field-label text-body">
          Your Review
        </label>
        <MarkdownEditor
          id={bodyId}
          value={content}
          onChange={setContent}
          placeholder="Share your thoughts on this game..."
          required
        />
      </div>

      {error && (
        <p className="text-danger-text text-meta bg-danger-subtle/20 border border-danger-subtle-border rounded-control px-3 py-2">
          {errorMessage(error)}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !canSubmit}
        className="btn-primary w-full"
      >
        {loading ? "Submitting…" : "Submit Review"}
      </button>
    </form>
  );
}
