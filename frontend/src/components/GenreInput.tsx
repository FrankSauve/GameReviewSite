import { useId } from "react";
import { useGenreSuggestions } from "../hooks/useGenreSuggestions";

/** Kept in step with LABEL_MAX_LENGTH in backend/src/lib/labels.ts, which enforces it. */
export const GENRE_MAX_LENGTH = 100;

interface GenreInputProps {
  value: string;
  onChange: (genre: string) => void;
  /** The game's own genres, offered after the reviewer's. */
  gameGenres?: string[] | undefined;
  size?: "sm" | "md";
}

/**
 * Free text, so a reviewer can file a game as narrowly as they like. Their own
 * genres are suggested first, so the same group keeps one spelling.
 */
export function GenreInput({
  value,
  onChange,
  gameGenres,
  size = "md",
}: GenreInputProps) {
  const id = useId();
  const listId = useId();
  const suggestions = useGenreSuggestions(gameGenres);

  const label =
    size === "md"
      ? "text-body text-content-muted"
      : "text-meta text-content-muted";

  return (
    <div>
      <label htmlFor={id} className={`block font-medium mb-1.5 ${label}`}>
        Genre
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={listId}
        maxLength={GENRE_MAX_LENGTH}
        autoComplete="off"
        placeholder="Blank uses the game's genres"
        className="input-field w-full"
      />
      <datalist id={listId}>
        {suggestions.map((genre) => (
          <option key={genre} value={genre} />
        ))}
      </datalist>
    </div>
  );
}
