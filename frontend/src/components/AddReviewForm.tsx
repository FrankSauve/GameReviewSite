import { useId, useState } from "react";
import { useMutation } from "@apollo/client";
import { CREATE_REVIEW } from "../graphql/mutations";
import { GET_GAME } from "../graphql/queries";
import { useAuth } from "../contexts/AuthContext";
import { REVIEW_CONTENT_MAX } from "../lib/markdown";
import { RatingInput } from "./RatingInput";
import { Markdown } from "./Markdown";

interface AddReviewFormProps {
  gameId: string;
  onSuccess?: () => void;
}

const DEFAULT_RATING = 8;

export function AddReviewForm({ gameId, onSuccess }: AddReviewFormProps) {
  const { user, signIn } = useAuth();
  const bodyId = useId();
  const [content, setContent] = useState("");
  const [rating, setRating] = useState<number>(DEFAULT_RATING);
  const [previewing, setPreviewing] = useState(false);

  const [createReview, { loading, error }] = useMutation(CREATE_REVIEW, {
    refetchQueries: [{ query: GET_GAME, variables: { id: gameId } }],
    onCompleted: () => {
      setContent("");
      setRating(DEFAULT_RATING);
      setPreviewing(false);
      onSuccess?.();
    },
  });

  if (!user) {
    return (
      <p className="text-sm text-gray-500">
        <button
          onClick={() => signIn()}
          className="text-violet-400 hover:text-violet-300 font-medium"
        >
          Sign in
        </button>{" "}
        to write a review.
      </p>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    void createReview({
      variables: { input: { gameId, rating, content: content.trim() } },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Your Rating
        </label>
        <RatingInput value={rating} onChange={setRating} />
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <label htmlFor={bodyId} className="block text-sm font-medium text-gray-400">
            Your Review
          </label>
          <button
            type="button"
            onClick={() => setPreviewing((p) => !p)}
            disabled={!content.trim()}
            className="text-xs text-violet-400 hover:text-violet-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
          >
            {previewing ? "Write" : "Preview"}
          </button>
        </div>

        {previewing ? (
          <div className="input-field min-h-[6.5rem] text-sm text-gray-300 leading-relaxed overflow-y-auto">
            <Markdown>{content}</Markdown>
          </div>
        ) : (
          <textarea
            id={bodyId}
            className="input-field resize-none"
            rows={6}
            placeholder="Share your thoughts on this game..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={REVIEW_CONTENT_MAX}
            required
          />
        )}

        <div className="flex items-baseline justify-between mt-1">
          <p className="text-xs text-gray-600">
            Markdown: **bold**, *italic*, - lists, &gt; quotes
          </p>
          <p className="text-xs text-gray-600">
            {content.length}/{REVIEW_CONTENT_MAX}
          </p>
        </div>
      </div>

      {error && (
        <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
          {error.graphQLErrors[0]?.message ?? error.message}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !content.trim()}
        className="btn-primary w-full"
      >
        {loading ? "Submitting…" : "Submit Review"}
      </button>
    </form>
  );
}
