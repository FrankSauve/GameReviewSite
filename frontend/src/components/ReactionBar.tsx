import { useCallback, useRef, useState } from "react";
import { useMutation } from "@apollo/client";
import { TOGGLE_REACTION } from "../graphql/mutations";
import { useAuth } from "../contexts/AuthContext";
import { useDismiss } from "../hooks/useDismiss";
import { DEFAULT_REACTIONS } from "../lib/emoji";
import { EmojiPicker } from "./EmojiPicker";
import type { ReactionSummary } from "../types";

interface ReactionBarProps {
  reactions: ReactionSummary[] | null | undefined;
  /** Exactly one of these, matching the mutation's input. */
  reviewId?: string;
  commentId?: string;
}

interface ToggleResult {
  toggleReaction: ReactionSummary[];
}

/** Nothing, the six defaults, or every emoji — one open menu at a time. */
type Menu = "none" | "quick" | "all";

export function ReactionBar({
  reactions,
  reviewId,
  commentId,
}: ReactionBarProps) {
  const { user, signIn } = useAuth();
  const [menu, setMenu] = useState<Menu>("none");
  // The mutation returns the parent's whole new summary, so nothing refetches.
  const [current, setCurrent] = useState<ReactionSummary[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [toggle] = useMutation<ToggleResult>(TOGGLE_REACTION);

  const dismiss = useCallback(() => setMenu("none"), []);
  useDismiss(containerRef, dismiss);

  const chips = current ?? reactions ?? [];

  const react = (emoji: string) => {
    setMenu("none");
    if (!user) {
      signIn();
      return;
    }
    void toggle({
      variables: {
        input: {
          ...(reviewId ? { reviewId } : {}),
          ...(commentId ? { commentId } : {}),
          emoji,
        },
      },
    }).then((res) => {
      if (res.data) setCurrent(res.data.toggleReaction);
    });
  };

  return (
    <div
      ref={containerRef}
      className="relative flex flex-wrap items-center gap-1"
    >
      {chips.map((chip) => (
        <button
          key={chip.emoji}
          type="button"
          onClick={() => react(chip.emoji)}
          aria-pressed={chip.reacted}
          aria-label={`React with ${chip.emoji}`}
          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm transition-colors ${
            chip.reacted
              ? "border-violet-600 bg-violet-600/20 text-violet-200"
              : "border-gray-700 bg-gray-800/60 text-gray-300 hover:border-gray-600"
          }`}
        >
          <span>{chip.emoji}</span>
          <span className="text-xs tabular-nums">{chip.count}</span>
        </button>
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
