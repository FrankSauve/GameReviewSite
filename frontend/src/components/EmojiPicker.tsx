import { useMemo, useState } from "react";
import { searchEmoji } from "../lib/emoji";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
}

/**
 * Renders emoji as text, never as images: the CSP allows no remote sprite
 * sheet, and the search index is bundled. See lib/emojiData.ts.
 */
export function EmojiPicker({ onSelect }: EmojiPickerProps) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchEmoji(query), [query]);

  return (
    <div className="absolute z-20 top-full mt-2 left-0 w-64 sm:w-72 popover p-2 space-y-2">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search emoji…"
        aria-label="Search emoji"
        autoFocus
        className="w-full bg-surface-raised/60 border border-line-strong rounded-control px-3 py-1.5 text-sm text-content placeholder-content-subtle focus:outline-none focus:border-accent-border transition-colors duration-theme"
      />
      {results.length === 0 ? (
        <p className="text-xs text-content-subtle px-1 py-2">No emoji found.</p>
      ) : (
        <div className="grid grid-cols-7 sm:grid-cols-8 gap-0.5 max-h-56 overflow-y-auto">
          {results.map((emoji) => (
            <button
              key={emoji.char}
              type="button"
              onClick={() => onSelect(emoji.char)}
              title={emoji.name}
              aria-label={emoji.name}
              className="text-lg leading-none p-1 rounded hover:bg-surface-raised transition-colors duration-theme"
            >
              {emoji.char}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
