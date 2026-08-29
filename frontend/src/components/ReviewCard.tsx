import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@apollo/client";
import type { Review } from "../types";
import { UPDATE_REVIEW, DELETE_REVIEW } from "../graphql/mutations";
import { GET_GAME } from "../graphql/queries";
import { useAuth } from "../contexts/AuthContext";
import { formatRating, ratingColor } from "../lib/rating";
import { REVIEW_CONTENT_MAX } from "../lib/markdown";
import { currentYear, formatPlaytime, snapHours } from "../lib/playtime";
import { RatingInput } from "./RatingInput";
import { PlaytimeInput } from "./PlaytimeInput";
import { Markdown } from "./Markdown";
import { reviewPath, userPath } from "../lib/links";

interface ReviewCardProps {
  review: Review;
  gameId: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function ReviewCard({ review, gameId }: ReviewCardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editRating, setEditRating] = useState(review.rating);
  const [editContent, setEditContent] = useState(review.content);
  const [editYear, setEditYear] = useState(review.yearPlayed ?? currentYear());
  const [editHours, setEditHours] = useState(
    review.hoursPlayed != null ? String(review.hoursPlayed) : ""
  );

  const commentCount = review.comments?.length ?? 0;
  const isOwner = user?.id === review.user?.id;
  const playtime = formatPlaytime(review.yearPlayed, review.hoursPlayed);

  const refetch = { refetchQueries: [{ query: GET_GAME, variables: { id: gameId } }] };

  const [updateReview, { loading: saving }] = useMutation(UPDATE_REVIEW, refetch);
  const [deleteReview, { loading: deleting }] = useMutation(DELETE_REVIEW, refetch);

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

  const handleCancelEdit = () => {
    setEditRating(review.rating);
    setEditContent(review.content);
    setEditYear(review.yearPlayed ?? currentYear());
    setEditHours(review.hoursPlayed != null ? String(review.hoursPlayed) : "");
    setEditing(false);
  };

  return (
    <div
      className="card p-5 relative cursor-pointer hover:border-violet-700 hover:shadow-lg hover:shadow-violet-900/20 transition-all duration-200"
      onClick={() => navigate(reviewPath(review))}
    >
      {/* Raised layer so interactive elements stay clickable */}
      <div className="relative z-10 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
            {(review.user?.username?.[0] ?? "?").toUpperCase()}
          </div>
          <div>
            <Link
              to={userPath(review.user)}
              className="font-semibold text-gray-200 hover:text-violet-300 text-sm transition-colors"
            >
              {review.user?.username ?? "Unknown"}
            </Link>
            <p className="text-xs text-gray-400">{timeAgo(review.createdAt)}</p>          </div>
        </div>

        <div className="flex items-center gap-2">
          {!editing && (
            <div className="flex items-baseline gap-1">
              <span className={`text-lg font-extrabold ${ratingColor(review.rating)}`}>
                {formatRating(review.rating)}
              </span>
              <span className="text-xs text-gray-600">/ 10</span>
            </div>
          )}
          {isOwner && !editing && (
            <>
              <button
                onClick={() => setEditing(true)}
                className="text-gray-400 hover:text-violet-400 transition-colors p-1"
                title="Edit review"
              >
                <PencilIcon />
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-gray-400 hover:text-red-400 transition-colors p-1"
                title="Delete review"
              >
                <TrashIcon />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="flex items-center gap-3 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2.5">
          <p className="text-sm text-red-300 flex-1">Delete this review?</p>
          <button
            onClick={() => void deleteReview({ variables: { id: review.id } })}
            disabled={deleting}
            className="text-xs font-semibold bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Inline edit form */}
      {editing ? (
        <div className="space-y-3">
          {/* Rating picker */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400 w-14 shrink-0">Rating</span>
            <div className="flex-1">
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

          {/* Text area */}
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={6}
            maxLength={REVIEW_CONTENT_MAX}
            className="input-field w-full resize-none text-sm"
            placeholder="Update your review…"
          />
          <p className="text-xs text-gray-600 -mt-1">
            Markdown: **bold**, *italic*, - lists, &gt; quotes
          </p>

          {/* Actions */}
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={handleCancelEdit}
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
        <div className="text-gray-300 text-sm leading-relaxed">
          <Markdown>{review.content}</Markdown>
        </div>
      )}

      {/* Comment count and playtime */}
      {!editing && (
        <div className="pt-2 border-t border-gray-800 flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1.5">
            <CommentIcon />
            {commentCount} {commentCount === 1 ? "comment" : "comments"}
          </span>
          {playtime && (
            <span className="flex items-center gap-1.5">
              <ClockIcon />
              {playtime}
            </span>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
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

