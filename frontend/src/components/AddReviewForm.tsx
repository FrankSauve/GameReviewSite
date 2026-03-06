import { useState } from "react";
import { useMutation } from "@apollo/client";
import { useNavigate } from "react-router-dom";
import { CREATE_REVIEW } from "../graphql/mutations";
import { GET_GAME } from "../graphql/queries";
import { useAuth } from "../contexts/AuthContext";

interface AddReviewFormProps {
  gameId: string;
  onSuccess?: () => void;
}

export function AddReviewForm({ gameId, onSuccess }: AddReviewFormProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [content, setContent] = useState("");
  const [rating, setRating] = useState<number>(8);
  const [hoverRating, setHoverRating] = useState<number | null>(null);

  const [createReview, { loading, error }] = useMutation(CREATE_REVIEW, {
    refetchQueries: [{ query: GET_GAME, variables: { id: gameId } }],
    onCompleted: () => {
      setContent("");
      setRating(8);
      onSuccess?.();
    },
  });

  if (!user) {
    return (
      <p className="text-sm text-gray-500">
        <button
          onClick={() => navigate("/login")}
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

  const displayRating = hoverRating ?? rating;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Your Rating:{" "}
          <span className="text-amber-400 font-bold">{displayRating}/10</span>
        </label>
        <div className="flex gap-1">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((val) => (
            <button
              key={val}
              type="button"
              onMouseEnter={() => setHoverRating(val)}
              onMouseLeave={() => setHoverRating(null)}
              onClick={() => setRating(val)}
              className={`w-9 h-9 rounded-lg text-sm font-bold transition-all duration-100 ${
                val <= displayRating
                  ? "bg-amber-500 text-gray-900 scale-105"
                  : "bg-gray-800 text-gray-500 hover:bg-gray-700"
              }`}
            >
              {val}
            </button>
          ))}
        </div>
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
