import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useApolloClient, useMutation, useQuery } from "@apollo/client";
import { TOGGLE_REACTION } from "../graphql/mutations";
import { GET_REACTION_USERS } from "../graphql/queries";
import { useAuth } from "../contexts/AuthContext";
import { useDismiss } from "../hooks/useDismiss";
import { DEFAULT_REACTIONS } from "../lib/emoji";
import { describeReactors } from "../lib/reactors";
import { EmojiPicker } from "./EmojiPicker";
import type { ReactionSummary } from "../types";

interface ReactionBarProps {
  reactions: ReactionSummary[] | null | undefined;
  /** Exactly one of these, the parent both the query and the mutation name. */
  reviewId?: string;
  commentId?: string;
}

interface ToggleResult {
  toggleReaction: ReactionSummary[];
}

interface ReactorsResult {
  reactionUsers: string[];
}

/** Nothing, the six defaults, or every emoji — one open menu at a time. */
type Menu = "none" | "quick" | "all";

/** How long a touch has to be held before the names appear instead of a toggle. */
const LONG_PRESS_MS = 400;

export function ReactionBar({
  reactions,
  reviewId,
  commentId,
}: ReactionBarProps) {
  const { user, signIn } = useAuth();
  const [menu, setMenu] = useState<Menu>("none");
  // The mutation returns the parent's whole new summary, so nothing refetches.
  const [current, setCurrent] = useState<ReactionSummary[] | null>(null);
  // The emoji whose reactors are named, if any: hovered, focused, or held.
  const [named, setNamed] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A long press names the reactors; the click it also fires must not toggle.
  const held = useRef(false);
  const tooltipId = useId();

  const client = useApolloClient();
  const [toggle] = useMutation<ToggleResult>(TOGGLE_REACTION);

  const target = reviewId ? { reviewId } : commentId ? { commentId } : {};

  // Fetched on hover, not with the review: see GET_REACTION_USERS. Apollo keeps
  // the answer, so hovering the same chip twice costs one request.
  const { data: reactors } = useQuery<ReactorsResult>(GET_REACTION_USERS, {
    variables: { ...target, emoji: named ?? "" },
    skip: named === null,
  });

  const dismiss = useCallback(() => {
    setMenu("none");
    setNamed(null);
  }, []);
  useDismiss(containerRef, dismiss);

  const endPress = useCallback(() => {
    if (pressTimer.current !== null) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }, []);
  useEffect(() => endPress, [endPress]);

  const startPress = (emoji: string) => {
    held.current = false;
    endPress();
    pressTimer.current = setTimeout(() => {
      held.current = true;
      setNamed(emoji);
    }, LONG_PRESS_MS);
  };

  const chips = current ?? reactions ?? [];

  const react = (emoji: string) => {
    setMenu("none");
    setNamed(null);
    if (!user) {
      signIn();
      return;
    }
    void toggle({ variables: { input: { ...target, emoji } } }).then((res) => {
      if (res.data) setCurrent(res.data.toggleReaction);
      // The names just changed, and the cached ones would outlive the counts.
      client.cache.evict({ id: "ROOT_QUERY", fieldName: "reactionUsers" });
      client.cache.gc();
    });
  };

  return (
    <div
      ref={containerRef}
      className="relative flex flex-wrap items-center gap-1"
    >
      {chips.map((chip) => (
        <span key={chip.emoji} className="relative flex">
          <button
            type="button"
            onClick={() => {
              if (held.current) {
                held.current = false;
                return;
              }
              react(chip.emoji);
            }}
            onMouseEnter={() => setNamed(chip.emoji)}
            onMouseLeave={() => setNamed(null)}
            onFocus={() => setNamed(chip.emoji)}
            onBlur={() => setNamed(null)}
            onTouchStart={() => startPress(chip.emoji)}
            onTouchEnd={endPress}
            onTouchCancel={endPress}
            onContextMenu={(e) => {
              // Holding on a touch screen raises this too; the names are the
              // answer to a hold here, not the browser's menu.
              if (named === chip.emoji) e.preventDefault();
            }}
            aria-pressed={chip.reacted}
            aria-label={`React with ${chip.emoji}`}
            aria-describedby={named === chip.emoji ? tooltipId : undefined}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm transition-colors ${
              chip.reacted
                ? "border-violet-600 bg-violet-600/20 text-violet-200"
                : "border-gray-700 bg-gray-800/60 text-gray-300 hover:border-gray-600"
            }`}
          >
            <span>{chip.emoji}</span>
            <span className="text-xs tabular-nums">{chip.count}</span>
          </button>

          {named === chip.emoji && (
            <span
              id={tooltipId}
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-0 z-30 mb-1 max-w-64 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 shadow-xl"
            >
              {describeReactors(reactors?.reactionUsers ?? [], chip.count)}{" "}
              reacted with {chip.emoji}
            </span>
          )}
        </span>
      ))}

      <button
        type="button"
        onClick={() => setMenu((open) => (open === "none" ? "quick" : "none"))}
        aria-label="Add a reaction"
        aria-expanded={menu !== "none"}
        className="flex items-center rounded-full border border-gray-700 bg-gray-800/60 text-gray-400 hover:text-gray-200 hover:border-gray-600 px-2 py-1 transition-colors"
      >
        <AddReactionIcon />
      </button>

      {menu === "quick" && (
        <div className="absolute z-20 top-full mt-2 left-0 card p-1 flex items-center gap-0.5 shadow-xl">
          {DEFAULT_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => react(emoji)}
              aria-label={`React with ${emoji}`}
              className="text-lg leading-none p-1 rounded hover:bg-gray-800 transition-colors"
            >
              {emoji}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMenu("all")}
            aria-label="More emoji"
            className="text-sm leading-none px-2 py-1.5 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
          >
            +
          </button>
        </div>
      )}

      {menu === "all" && <EmojiPicker onSelect={react} />}
    </div>
  );
}

function AddReactionIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 10h.01M15 10h.01M9.5 15a3.5 3.5 0 005 0M18 3v4m2-2h-4M20.5 11a8.5 8.5 0 11-7.5-7.46"
      />
    </svg>
  );
}
