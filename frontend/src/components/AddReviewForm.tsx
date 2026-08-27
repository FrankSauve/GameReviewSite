import { useState } from "react";
import { useMutation } from "@apollo/client";
import { CREATE_REVIEW } from "../graphql/mutations";
import { GET_GAME } from "../graphql/queries";
import { useAuth } from "../contexts/AuthContext";
import { RatingInput } from "./RatingInput";

interface AddReviewFormProps {
  gameId: string;
  onSuccess?: () => void;
}

const DEFAULT_RATING = 8;

export function AddReviewForm({ gameId, onSuccess }: AddReviewFormProps) {
  const { user, signIn } = useAuth();
  const [content, setContent] = useState("");
  const [rating, setRating] = useState<number>(DEFAULT_RATING);

  const [createReview, { loading, error }] = useMutation(CREATE_REVIEW, {
    refetchQueries: [{ query: GET_GAME, variables: { id: gameId } }],
    onCompleted: () => {
      setContent("");
      setRating(DEFAULT_RATING);
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
        <label className="block text-sm font-medium text-gray-400 mb-1.5">
          Your Review
        </label>
        <textarea
          className="input-field resize-none"
          rows={4}
          placeholder="Share your thoughts on this game..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={5000}
          required
        />
        <p className="text-xs text-gray-600 mt-1 text-right">{content.length}/5000</p>
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
