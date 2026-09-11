import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation } from "@apollo/client";
import { GET_REVIEW } from "../graphql/queries";
import {
  CREATE_COMMENT,
  DELETE_COMMENT,
  DELETE_REVIEW,
  UPDATE_REVIEW,
} from "../graphql/mutations";
import { useAuth } from "../contexts/AuthContext";
import { formatRating, ratingColor } from "../lib/rating";
import { currentYear, formatPlaytime, snapHours } from "../lib/playtime";
import { RatingInput } from "../components/RatingInput";
import { PlaytimeInput } from "../components/PlaytimeInput";
import { PlatformSelect } from "../components/PlatformSelect";
import { Markdown } from "../components/Markdown";
import { ReactionBar } from "../components/ReactionBar";
import type { ReactionSummary } from "../types";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { gamePath, reviewPath, userPath } from "../lib/links";
import { GameCover } from "../components/GameCover";
import { useCanonicalPath } from "../hooks/useCanonicalPath";
import { Avatar } from "../components/Avatar";

interface CommentUser {
  id: string;
  slug?: string | null;
  username: string;
  avatarColor?: string | null;
}
interface ReviewComment {
  id: string;
  content: string;
  createdAt: string;
  user?: CommentUser | null;
  reactions?: ReactionSummary[] | null;
}
interface ReviewGame {
  id: string;
  slug?: string | null;
  title: string;
  coverUrl?: string | null;
  releaseYear?: number | null;
  genres?: string[];
}
interface ReviewDetail {
  id: string;
  slug?: string | null;
  rating: number;
  content: string;
  createdAt: string;
  yearPlayed?: number | null;
  hoursPlayed?: number | null;
  platform?: string | null;
  user?: CommentUser | null;
  game?: ReviewGame | null;
  comments?: ReviewComment[];
  reactions?: ReactionSummary[] | null;
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
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ReviewDetailPage() {
  // The whole path under /reviews is the key: `alice/elden-ring` is what the
  // review stores as its slug, and a UUID arrives as the same single string.
  const id = useParams()["*"] || undefined;
  const { user, signIn } = useAuth();

  const { data, loading, error } = useQuery<{ review: ReviewDetail | null }>(
    GET_REVIEW,
    { variables: { id }, skip: !id },
  );

  useCanonicalPath(data?.review ? reviewPath(data.review) : null);

  const refetchOpts = {
    refetchQueries: [{ query: GET_REVIEW, variables: { id } }],
  };

  const [deleteReview, { loading: deleting }] = useMutation(
    DELETE_REVIEW,
    refetchOpts,
  );
  const [updateReview, { loading: saving }] = useMutation(
    UPDATE_REVIEW,
    refetchOpts,
  );
  const [deleteComment] = useMutation(DELETE_COMMENT, refetchOpts);
  const [createComment, { loading: submitting }] = useMutation(
    CREATE_COMMENT,
    refetchOpts,
  );

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editRating, setEditRating] = useState(0);
  const [editContent, setEditContent] = useState("");
  const [editYear, setEditYear] = useState(currentYear());
  const [editHours, setEditHours] = useState("");
  const [editPlatform, setEditPlatform] = useState("");
  const [newComment, setNewComment] = useState("");

  if (loading) {
    return (
      <div className="w-screen relative left-1/2 right-1/2 -mx-[50vw] px-4 sm:px-6 lg:px-10">
        <div className="page-column space-y-4 animate-pulse">
          <div className="h-52 bg-surface-raised rounded-card" />
          <div className="card p-6 space-y-3">
            <div className="h-5 skeleton-bar w-1/3" />
            <div className="h-3 skeleton-bar w-1/5" />
            <div className="h-24 skeleton-bar" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data?.review) {
    return (
      <div className="empty-state space-y-3 max-w-2xl mx-auto">
        <p className="text-4xl">💬</p>
        <p className="text-content-body font-medium">Review not found</p>
        <Link
          to="/"
          className="text-accent-subtle-text hover:text-accent-subtle-text text-sm transition-colors duration-theme"
        >
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
    setEditPlatform(review.platform ?? "");
    setEditing(true);
  };

  const editHoursNum = Number(editHours);
  const editHoursValid =
    editHours.trim() !== "" &&
    Number.isFinite(editHoursNum) &&
    editHoursNum > 0;

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
          platform: editPlatform || null,
        },
      },
    });
    setEditing(false);
  };

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newComment.trim();
    if (!trimmed || submitting) return;
    void createComment({
      variables: { input: { reviewId: review.id, content: trimmed } },
    });
    setNewComment("");
  };

  return (
    <div className="w-screen relative left-1/2 right-1/2 -mx-[50vw] px-4 sm:px-6 lg:px-10">
      <div className="page-column space-y-5">
        {/* ── Back breadcrumb ── */}
        <div className="flex items-center gap-2 text-sm">
          <Link
            to="/"
            className="text-content-subtle hover:text-content-body transition-colors duration-theme"
          >
            Home
          </Link>
          <span className="text-content-faint">/</span>
          {game && (
            <>
              <Link
                to={gamePath(game)}
                className="text-content-subtle hover:text-content-body transition-colors duration-theme truncate max-w-xs"
              >
                {game.title}
              </Link>
              <span className="text-content-faint">/</span>
            </>
          )}
          <span className="text-content-muted truncate">Review</span>
        </div>

        {/* ── Game banner ── */}
        {game && (
          <Link to={gamePath(game)} className="group block">
            <div className="relative h-40 rounded-card overflow-hidden">
              <GameCover game={game} size="lg" eager />
              <div className="absolute inset-0 bg-gradient-to-t from-scrim/90 via-scrim/40 to-transparent" />
              <div className="absolute bottom-4 left-4">
                <h2 className="text-xl font-bold text-accent-contrast group-hover:text-accent-subtle-text transition-colors duration-theme">
                  {game.title}
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  {game.releaseYear && (
                    <span className="text-xs text-content-muted">
                      {game.releaseYear}
                    </span>
                  )}
                  {game.genres && game.genres.length > 0 && (
                    <span className="text-xs text-content-subtle">
                      · {game.genres.join(", ")}
                    </span>
                  )}
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
                <Avatar user={review.user} size={10} />
              </Link>
              <div>
                <Link
                  to={userPath(review.user)}
                  className="font-semibold text-content hover:text-accent-subtle-text transition-colors duration-theme"
                >
                  {review.user?.username ?? "Unknown"}
                </Link>
                <p className="text-xs text-content-subtle">
                  {timeAgo(review.createdAt)}
                  {playtime && (
                    <span className="text-content-faint">
                      {" "}
                      · played {playtime}
                    </span>
                  )}
                </p>
                {review.platform && (
                  <span className="inline-block mt-1 text-xs font-medium bg-surface-raised text-content-body px-2 py-0.5 rounded-pill border border-line-strong">
                    {review.platform}
                  </span>
                )}
              </div>
            </div>

            {/* Score */}
            {!editing && (
              <div className="flex items-baseline gap-1 shrink-0">
                <span
                  className={`text-3xl font-black ${ratingColor(review.rating)}`}
                >
                  {formatRating(review.rating)}
                </span>
                <span className="text-sm text-content-faint">/ 10</span>
              </div>
            )}
          </div>

          {/* Delete confirmation */}
          {confirmDelete && (
            <div className="flex items-center gap-3 bg-danger-subtle/40 border border-danger-subtle-border/50 rounded-control px-3 py-2.5">
              <p className="text-sm text-danger-text flex-1">
                Delete this review?
              </p>
              <Link
                to={gamePath(game)}
                onClick={() =>
                  void deleteReview({ variables: { id: review.id } })
                }
                className="text-xs font-semibold bg-danger hover:bg-danger-hover text-accent-contrast px-3 py-1 rounded-control transition-colors duration-theme disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </Link>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs text-content-muted hover:text-content transition-colors duration-theme"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Edit form */}
          {editing ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-content-muted w-14 shrink-0">
                  Rating
                </span>
                <div className="flex-1 min-w-[16rem]">
                  <RatingInput
                    value={editRating}
                    onChange={setEditRating}
                    size="sm"
                  />
                </div>
              </div>

              <PlaytimeInput
                year={editYear}
                hours={editHours}
                onYearChange={setEditYear}
                onHoursChange={setEditHours}
                size="sm"
              />
              <PlatformSelect
                value={editPlatform}
                onChange={setEditPlatform}
                size="sm"
              />
              <MarkdownEditor
                value={editContent}
                onChange={setEditContent}
                placeholder="Update your review…"
              />
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
            <div className="space-y-4">
              <div className="text-content leading-relaxed">
                <Markdown>{review.content}</Markdown>
              </div>
              <ReactionBar reviewId={review.id} reactions={review.reactions} />
            </div>
          )}

          {/* Owner actions */}
          {isOwner && !editing && !confirmDelete && (
            <div className="flex items-center gap-3 pt-1 border-t border-line">
              <button
                onClick={startEdit}
                className="flex items-center gap-1 text-xs text-content-muted hover:text-accent-subtle-text transition-colors duration-theme"
              >
                <PencilIcon /> Edit
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1 text-xs text-content-muted hover:text-danger-text transition-colors duration-theme"
              >
                <TrashIcon /> Delete
              </button>
            </div>
          )}
        </div>

        {/* ── Comments ── */}
        <div className="card p-6 space-y-4">
          <h3 className="font-semibold text-content-body text-sm">
            {comments.length} {comments.length === 1 ? "Comment" : "Comments"}
          </h3>

          {comments.length > 0 && (
            <div className="space-y-4 divide-y divide-line">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-3 pt-4 first:pt-0">
                  <Link to={userPath(comment.user)} className="shrink-0">
                    <Avatar user={comment.user} size={8} />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <Link
                        to={userPath(comment.user)}
                        className="text-sm font-semibold text-content hover:text-accent-subtle-text transition-colors duration-theme"
                      >
                        {comment.user?.username ?? "Unknown"}
                      </Link>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-content-faint">
                          {timeAgo(comment.createdAt)}
                        </span>
                        {user?.id === comment.user?.id && (
                          <button
                            onClick={() =>
                              void deleteComment({
                                variables: { id: comment.id },
                              })
                            }
                            className="text-content-faint hover:text-danger-text transition-colors duration-theme"
                            title="Delete comment"
                          >
                            <TrashIcon size="sm" />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-content-body mt-1">
                      {comment.content}
                    </p>
                    <div className="mt-2">
                      <ReactionBar
                        commentId={comment.id}
                        reactions={comment.reactions}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add comment */}
          {user ? (
            <form
              onSubmit={handleSubmitComment}
              className="flex items-center gap-3 pt-2 border-t border-line"
            >
              <Avatar user={user} size={8} />
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment…"
                maxLength={500}
                disabled={submitting}
                className="flex-1 bg-surface-raised/60 border border-line-strong rounded-pill px-4 py-2 text-sm text-content placeholder-content-subtle focus:outline-none focus:border-accent-border disabled:opacity-50 transition-colors duration-theme"
              />
              <button
                type="submit"
                disabled={!newComment.trim() || submitting}
                className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-accent-contrast text-sm font-semibold rounded-pill transition-colors duration-theme"
              >
                {submitting ? "…" : "Post"}
              </button>
            </form>
          ) : (
            <p className="text-sm text-content-faint pt-2 border-t border-line">
              <button
                onClick={() => signIn()}
                className="text-accent-subtle-text hover:text-accent-subtle-text transition-colors duration-theme"
              >
                Sign in
              </button>{" "}
              to leave a comment.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
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

function TrashIcon({ size = "md" }: { size?: "sm" | "md" }) {
  const cls = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";
  return (
    <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}
