import { useCallback, useRef, useState } from "react";
import { useMutation } from "@apollo/client";
import { TOGGLE_REACTION } from "../graphql/mutations";
import { useAuth } from "../contexts/AuthContext";
import { useDismiss } from "../hooks/useDismiss";
import { DEFAULT_REACTIONS } from "../lib/emoji";
import { EmojiPicker } from "./EmojiPicker";

export interface ReactionSummary {
  emoji: string;
  count: number;
  reacted: boolean;
}

interface ReactionBarProps {
  reactions: ReactionSummary[] | null | undefined;
  /** Exactly one of these, matching the mutation's input. */
  reviewId?: string;
  commentId?: string;
}

interface ToggleResult {
  toggleReaction: ReactionSummary[];
}

/** The default row is always shown, so an unreacted review still offers one. */
function chipsFor(reactions: readonly ReactionSummary[]): ReactionSummary[] {
  const byEmoji = new Map(reactions.map((r) => [r.emoji, r]));
  const defaults = DEFAULT_REACTIONS.map(
    (emoji) => byEmoji.get(emoji) ?? { emoji, count: 0, reacted: false },
  );
  const extra = reactions.filter((r) => !DEFAULT_REACTIONS.includes(r.emoji));
  return [...defaults, ...extra];
}

export function ReactionBar({
  reactions,
  reviewId,
  commentId,
}: ReactionBarProps) {
  const { user, signIn } = useAuth();
  const [open, setOpen] = useState(false);
  // The mutation returns the parent's whole new summary, so nothing refetches.
  const [current, setCurrent] = useState<ReactionSummary[] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [toggle] = useMutation<ToggleResult>(TOGGLE_REACTION);

  const dismiss = useCallback(() => setOpen(false), []);
  useDismiss(containerRef, dismiss);

  const chips = chipsFor(current ?? reactions ?? []);

  const react = (emoji: string) => {
    setOpen(false);
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
          {chip.count > 0 && (
            <span className="text-xs tabular-nums">{chip.count}</span>
          )}
        </button>
      ))}

      <button
        type="button"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        aria-label="Add a reaction"
        aria-expanded={open}
        className="rounded-full border border-gray-700 bg-gray-800/60 text-gray-400 hover:text-gray-200 hover:border-gray-600 px-2 py-0.5 text-sm transition-colors"
      >
        +
      </button>

      {open && <EmojiPicker onSelect={react} />}
    </div>
  );
}
