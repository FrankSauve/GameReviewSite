import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "@apollo/client";
import { GET_REVIEW } from "../graphql/queries";
import { CREATE_COMMENT, DELETE_COMMENT, DELETE_REVIEW, UPDATE_REVIEW } from "../graphql/mutations";
import { useAuth } from "../contexts/AuthContext";
import { formatRating, ratingColor } from "../lib/rating";
import { REVIEW_CONTENT_MAX } from "../lib/markdown";
import { currentYear, formatPlaytime, snapHours } from "../lib/playtime";
import { RatingInput } from "../components/RatingInput";
import { PlaytimeInput } from "../components/PlaytimeInput";
import { Markdown } from "../components/Markdown";
import { gamePath, reviewPath, userPath } from "../lib/links";
import { useCanonicalPath } from "../hooks/useCanonicalPath";

interface CommentUser { id: string; slug?: string | null; username: string; }
interface ReviewComment { id: string; content: string; createdAt: string; user?: CommentUser | null; }
interface ReviewGame {
  id: string; slug?: string | null; title: string; coverUrl?: string | null;
  releaseYear?: number | null; genre?: string | null; platform?: string | null;
}
interface ReviewDetail {
  id: string; slug?: string | null; rating: number; content: string; createdAt: string;
  yearPlayed?: number | null;
  hoursPlayed?: number | null;
  user?: CommentUser | null;
  game?: ReviewGame | null;
  comments?: ReviewComment[];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function avatarGradient(username: string): string {
  const gradients = [
    "from-violet-600 to-indigo-700", "from-rose-600 to-pink-700",
    "from-emerald-600 to-teal-700", "from-blue-600 to-cyan-700",
    "from-amber-600 to-orange-700", "from-fuchsia-600 to-purple-700",
  ];
  const idx = [...username].reduce((a, c) => a + c.charCodeAt(0), 0) % gradients.length;
  return gradients[idx];
}

export function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, signIn } = useAuth();

  const { data, loading, error } = useQuery<{ review: ReviewDetail | null }>(
    GET_REVIEW,
    { variables: { id }, skip: !id }
  );

  useCanonicalPath(data?.review ? reviewPath(data.review) : null);

  const refetchOpts = { refetchQueries: [{ query: GET_REVIEW, variables: { id } }] };

  const [deleteReview, { loading: deleting }] = useMutation(DELETE_REVIEW, refetchOpts);
  const [updateReview, { loading: saving }] = useMutation(UPDATE_REVIEW, refetchOpts);
  const [deleteComment] = useMutation(DELETE_COMMENT, refetchOpts);
  const [createComment, { loading: submitting }] = useMutation(CREATE_COMMENT, refetchOpts);

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editRating, setEditRating] = useState(0);
  const [editContent, setEditContent] = useState("");
  const [editYear, setEditYear] = useState(currentYear());
  const [editHours, setEditHours] = useState("");
  const [newComment, setNewComment] = useState("");

  if (loading) {
    return (
      <div className="w-screen relative left-1/2 right-1/2 -mx-[50vw] px-4 sm:px-6 lg:px-10">
        <div className="max-w-3xl lg:max-w-5xl 2xl:max-w-6xl mx-auto space-y-4 animate-pulse">
          <div className="h-52 bg-gray-800 rounded-xl" />
          <div className="card p-6 space-y-3">
            <div className="h-5 bg-gray-800 rounded w-1/3" />
            <div className="h-3 bg-gray-800 rounded w-1/5" />
            <div className="h-24 bg-gray-800 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data?.review) {
    return (
      <div className="card p-12 text-center space-y-3 max-w-2xl mx-auto">
        <p className="text-4xl">💬</p>
        <p className="text-gray-300 font-medium">Review not found</p>
        <Link to="/" className="text-violet-400 hover:text-violet-300 text-sm transition-colors">
          Back to home
        </Link>
      </div>
    );
  }

  const review = data.review;
  const game = review.game;
  const isOwner = user?.id === review.user?.id;
  const comments = review.comments ?? [];
  const playtime = formatPlaytime(review.yearPlayed, review.hoursPlayed);

  const startEdit = () => {
    setEditRating(review.rating);
    setEditContent(review.content);
    setEditYear(review.yearPlayed ?? currentYear());
    setEditHours(review.hoursPlayed != null ? String(review.hoursPlayed) : "");
    setEditing(true);
  };

  const editHoursNum = Number(editHours);
  const editHoursValid =
    editHours.trim() !== "" && Number.isFinite(editHoursNum) && editHoursNum > 0;

  const handleSave = async () => {
    if (!editContent.trim() || !editHoursValid) return;
    await updateReview({
      variables: {
        id: review.id,
        input: {
          rating: editRating,
          content: editContent.trim(),
          yearPlayed: editYear,
          hoursPlayed: snapHours(editHoursNum),
        },
      },
    });
    setEditing(false);
  };

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newComment.trim();
    if (!trimmed || submitting) return;
    createComment({ variables: { input: { reviewId: review.id, content: trimmed } } });
    setNewComment("");
  };

  return (
    <div className="w-screen relative left-1/2 right-1/2 -mx-[50vw] px-4 sm:px-6 lg:px-10">
    <div className="max-w-3xl lg:max-w-5xl 2xl:max-w-6xl mx-auto space-y-5">
      {/* ── Back breadcrumb ── */}
      <div className="flex items-center gap-2 text-sm">
        <Link to="/" className="text-gray-500 hover:text-gray-300 transition-colors">Home</Link>
        <span className="text-gray-700">/</span>
        {game && (
          <>
            <Link to={gamePath(game)} className="text-gray-500 hover:text-gray-300 transition-colors truncate max-w-xs">
              {game.title}
            </Link>
            <span className="text-gray-700">/</span>
          </>
        )}
        <span className="text-gray-400 truncate">Review</span>
      </div>

      {/* ── Game banner ── */}
      {game && (
        <Link to={gamePath(game)} className="group block">
          <div className="relative h-40 rounded-xl overflow-hidden">
            {game.coverUrl ? (
              <img
                src={game.coverUrl}
                alt={game.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-gray-950/90 via-gray-950/40 to-transparent" />
            <div className="absolute bottom-4 left-4">
              <h2 className="text-xl font-bold text-white group-hover:text-violet-300 transition-colors">
                {game.title}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                {game.releaseYear && <span className="text-xs text-gray-400">{game.releaseYear}</span>}
                {game.genre && <span className="text-xs text-gray-500">· {game.genre}</span>}
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* ── Review body ── */}
      <div className="card p-6 space-y-4">
        {/* Header: avatar + name + rating + actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to={userPath(review.user)}>
              <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarGradient(review.user?.username ?? "?")} flex items-center justify-center text-sm font-bold text-white shrink-0`}>
                {(review.user?.username ?? "?")[0].toUpperCase()}
              </div>
            </Link>
            <div>
              <Link
                to={userPath(review.user)}
                className="font-semibold text-gray-100 hover:text-violet-300 transition-colors"
              >
                {review.user?.username ?? "Unknown"}
              </Link>
              <p className="text-xs text-gray-500">
                {timeAgo(review.createdAt)}
                {playtime && <span className="text-gray-600"> · played {playtime}</span>}
              </p>
            </div>
          </div>

          {/* Score */}
          {!editing && (
            <div className="flex items-baseline gap-1 shrink-0">
              <span className={`text-3xl font-black ${ratingColor(review.rating)}`}>
                {formatRating(review.rating)}
              </span>
              <span className="text-sm text-gray-600">/ 10</span>
            </div>
          )}
        </div>

        {/* Delete confirmation */}
        {confirmDelete && (
          <div className="flex items-center gap-3 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2.5">
            <p className="text-sm text-red-300 flex-1">Delete this review?</p>
            <Link
              to={gamePath(game)}
              onClick={() => void deleteReview({ variables: { id: review.id } })}
              className="text-xs font-semibold bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </Link>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Edit form */}
        {editing ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-gray-400 w-14 shrink-0">Rating</span>
              <div className="flex-1 min-w-[16rem]">
                <RatingInput value={editRating} onChange={setEditRating} size="sm" />
              </div>
            </div>

            <PlaytimeInput
              year={editYear}
              hours={editHours}
              onYearChange={setEditYear}
              onHoursChange={setEditHours}
              size="sm"
            />
            <textarea
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              rows={6}
              maxLength={REVIEW_CONTENT_MAX}
              className="input-field w-full resize-none text-sm"
              placeholder="Update your review…"
            />
            <p className="text-xs text-gray-600">
              Markdown: **bold**, *italic*, - lists, &gt; quotes
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setEditing(false)}
                className="btn-secondary text-sm py-1.5 px-3"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving || !editContent.trim() || !editHoursValid}
                className="btn-primary text-sm py-1.5 px-3 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-gray-200 leading-relaxed">
            <Markdown>{review.content}</Markdown>
          </div>
        )}

        {/* Owner actions */}
        {isOwner && !editing && !confirmDelete && (
          <div className="flex items-center gap-3 pt-1 border-t border-gray-800">
            <button
              onClick={startEdit}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-violet-400 transition-colors"
            >
              <PencilIcon /> Edit
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-400 transition-colors"
            >
              <TrashIcon /> Delete
            </button>
          </div>
        )}
      </div>

      {/* ── Comments ── */}
      <div className="card p-6 space-y-4">
        <h3 className="font-semibold text-gray-300 text-sm">
          {comments.length} {comments.length === 1 ? "Comment" : "Comments"}
        </h3>

        {comments.length > 0 && (
          <div className="space-y-4 divide-y divide-gray-800">
            {comments.map(comment => (
              <div key={comment.id} className="flex gap-3 pt-4 first:pt-0">
                <Link to={userPath(comment.user)} className="shrink-0">
                  <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${avatarGradient(comment.user?.username ?? "?")} flex items-center justify-center text-xs font-bold text-white`}>
                    {(comment.user?.username ?? "?")[0].toUpperCase()}
                  </div>
                </Link>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <Link
                      to={userPath(comment.user)}
                      className="text-sm font-semibold text-gray-200 hover:text-violet-300 transition-colors"
                    >
                      {comment.user?.username ?? "Unknown"}
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-600">{timeAgo(comment.createdAt)}</span>
                      {user?.id === comment.user?.id && (
                        <button
                          onClick={() => void deleteComment({ variables: { id: comment.id } })}
                          className="text-gray-600 hover:text-red-400 transition-colors"
                          title="Delete comment"
                        >
                          <TrashIcon size="sm" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-300 mt-1">{comment.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add comment */}
        {user ? (
          <form onSubmit={handleSubmitComment} className="flex items-center gap-3 pt-2 border-t border-gray-800">
            <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${avatarGradient(user.username)} flex items-center justify-center text-xs font-bold text-white shrink-0`}>
              {user.username[0].toUpperCase()}
            </div>
            <input
              type="text"
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Add a comment…"
              maxLength={500}
              disabled={submitting}
              className="flex-1 bg-gray-800/60 border border-gray-700 rounded-full px-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-600 disabled:opacity-50 transition-colors"
            />
            <button
              type="submit"
              disabled={!newComment.trim() || submitting}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-full transition-colors"
            >
              {submitting ? "…" : "Post"}
            </button>
          </form>
        ) : (
          <p className="text-sm text-gray-600 pt-2 border-t border-gray-800">
            <button onClick={() => signIn()} className="text-violet-400 hover:text-violet-300 transition-colors">Sign in</button> to leave a comment.
          </p>
        )}
      </div>
    </div>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function TrashIcon({ size = "md" }: { size?: "sm" | "md" }) {
  const cls = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";
  return (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
