import { useState } from "react";
import { useMutation } from "@apollo/client";
import { CREATE_COMMENT } from "../graphql/mutations";
import { GET_GAME } from "../graphql/queries";

interface AddCommentFormProps {
  reviewId: string;
  gameId: string;
  onCancel: () => void;
}

export function AddCommentForm({ reviewId, gameId, onCancel }: AddCommentFormProps) {
  const [content, setContent] = useState("");

  const [createComment, { loading, error }] = useMutation(CREATE_COMMENT, {
    refetchQueries: [{ query: GET_GAME, variables: { id: gameId } }],
    onCompleted: () => {
      setContent("");
      onCancel();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    void createComment({
      variables: { input: { reviewId, content: content.trim() } },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2">
      <textarea
        className="input-field text-sm resize-none"
        rows={2}
        placeholder="Write a comment..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        maxLength={2000}
        required
      />
      {error && (
        <p className="text-red-400 text-xs">
          {error.graphQLErrors[0]?.message ?? error.message}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading || !content.trim()}
          className="btn-primary text-sm py-1.5"
        >
          {loading ? "Posting…" : "Post"}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary text-sm py-1.5">
          Cancel
        </button>
      </div>
    </form>
  );
}
