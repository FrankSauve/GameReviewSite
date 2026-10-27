import { useId, useState } from "react";
import { useGenreSuggestions } from "../hooks/useGenreSuggestions";
import { GENRE_MAX_LENGTH } from "./GenreInput";

/** Kept in step with MAX_LABELS in backend/src/lib/labels.ts, which enforces it. */
export const MAX_SECONDARY_GENRES = 5;

interface SecondaryGenresInputProps {
  value: string[];
  onChange: (genres: string[]) => void;
  /** The review's genre, which the server drops from this list. */
  genre: string;
  gameGenres?: string[] | undefined;
  size?: "sm" | "md";
}

const sameGenre = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * More genres to filter the profile by, never to group it by. Added on Enter,
 * a comma or leaving the field, so a typed one is not lost on submit.
 */
export function SecondaryGenresInput({
  value,
  onChange,
  genre,
  gameGenres = [],
  size = "md",
}: SecondaryGenresInputProps) {
  const id = useId();
  const listId = useId();
  const [draft, setDraft] = useState("");
  const full = value.length >= MAX_SECONDARY_GENRES;
  const suggestions = useGenreSuggestions(gameGenres).filter(
    (s) => !sameGenre(s, genre) && !value.some((v) => sameGenre(s, v)),
  );

  /** Adds each of `texts` that is new, then leaves `rest` in the field. */
  const commit = (texts: string[], rest = "") => {
    const next = [...value];
    for (const text of texts) {
      const added = text.replace(/\s+/g, " ").trim();
      if (
        added &&
        next.length < MAX_SECONDARY_GENRES &&
        !sameGenre(added, genre) &&
        !next.some((v) => sameGenre(added, v))
      )
        next.push(added);
    }
    setDraft(rest);
    if (next.length !== value.length) onChange(next);
  };

  const label =
    size === "md"
      ? "text-body text-content-muted"
      : "text-meta text-content-muted";

  return (
    <div>
      <label htmlFor={id} className={`block font-medium mb-1.5 ${label}`}>
        Other genres{" "}
        <span className="text-content-subtle font-normal">
          {value.length}/{MAX_SECONDARY_GENRES}
        </span>
      </label>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1 mb-1.5">
          {value.map((g) => (
            <li
              key={g}
              className="text-micro font-medium bg-surface-raised text-content-body pl-2 pr-1 py-0.5 rounded-pill border border-line-strong flex items-center gap-1"
            >
              {g}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== g))}
                aria-label={`Remove ${g}`}
                className="text-content-subtle hover:text-content px-1"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={id}
        type="text"
        value={draft}
        onChange={(e) => {
          const parts = e.target.value.split(",");
          const rest = parts.pop() ?? "";
          if (parts.length) commit(parts, rest);
          else setDraft(rest);
        }}
        onKeyDown={(e) => {
          // Enter would otherwise submit the whole review.
          if (e.key !== "Enter") return;
          e.preventDefault();
          commit([draft]);
        }}
        onBlur={() => commit([draft])}
        list={listId}
        maxLength={GENRE_MAX_LENGTH}
        disabled={full}
        autoComplete="off"
        placeholder={full ? "Five is the most" : "Horror, open world…"}
        className="input-field w-full"
      />
      <datalist id={listId}>
        {suggestions.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
    </div>
  );
}
