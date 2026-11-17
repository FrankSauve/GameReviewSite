import { useRef, useState } from "react";
import { useMutation } from "@apollo/client/react";
import { SET_YEAR_AWARDS } from "../graphql/mutations";
import type { PickableGame } from "../lib/favorites";
import {
  AWARD_CATEGORY_MAX,
  AWARD_NAME_MAX,
  AWARD_RANK_MAX,
  draftProblem,
  moveItem,
  withAwardYear,
  type AwardDraft,
} from "../lib/awards";
import { errorMessage } from "../lib/errorMessage";
import type { YearAwardsData } from "./YearAwards";

/** A row's key outlives moves and removals, so an input keeps its own text and focus. */
type DraftCategory = AwardDraft["categories"][number] & { key: number };
type Draft = Omit<AwardDraft, "categories"> & { categories: DraftCategory[] };

interface YearAwardsEditorProps {
  userId: string;
  year: number;
  awards: YearAwardsData;
  /** The games reviewed as played this year; the only ones the API accepts. */
  eligible: PickableGame[];
  onDone: () => void;
}

export function YearAwardsEditor({
  userId,
  year,
  awards,
  eligible,
  onDone,
}: YearAwardsEditorProps) {
  const nextKey = useRef(awards.categories.length);
  const [draft, setDraft] = useState<Draft>(() => ({
    ranking: awards.ranking.map((r) => r.game),
    categories: awards.categories.map(({ name, game }, key) => ({
      name,
      game,
      key,
    })),
  }));
  const [save, { loading: saving, error }] = useMutation<{
    setYearAwards: YearAwardsData;
  }>(SET_YEAR_AWARDS, {
    onCompleted: onDone,
    // awardYears is a separate field on User, so the YearAwards the mutation
    // returns does not refresh it.
    update(cache, { data }) {
      const saved = data?.setYearAwards;
      const id = cache.identify({ __typename: "User", id: userId });
      if (!saved || !id) return;
      const hasAwards = saved.ranking.length > 0 || saved.categories.length > 0;
      cache.modify<{ awardYears: number[] }>({
        id,
        fields: {
          awardYears: (years) =>
            Array.isArray(years)
              ? withAwardYear(years, year, hasAwards)
              : years,
        },
      });
    },
  });

  // A game the year already awards stays pickable after its review moves year,
  // matching the API, which accepts it on the same grounds.
  const known = new Map(eligible.map((g) => [g.id, g]));
  for (const { game } of [...awards.ranking, ...awards.categories])
    if (!known.has(game.id)) known.set(game.id, game);

  const ranked = new Set(draft.ranking.map((g) => g.id));
  const unranked = [...known.values()].filter((g) => !ranked.has(g.id));
  const problem = draftProblem(draft);

  const setRanking = (ranking: PickableGame[]) =>
    setDraft((d) => ({ ...d, ranking }));
  const setCategories = (categories: DraftCategory[]) =>
    setDraft((d) => ({ ...d, categories }));

  const submit = () => {
    void save({
      variables: {
        input: {
          year,
          ranking: draft.ranking.map((g) => g.id),
          categories: draft.categories.map(({ name, game }) => ({
            name: name.trim(),
            gameId: game?.id ?? "",
          })),
        },
      },
    });
  };

  if (known.size === 0) {
    return (
      <div className="card p-10 text-center space-y-3">
        <p className="text-content-muted">
          Awards are picked from the games you reviewed as played in {year}.
          There are none yet.
        </p>
        <button
          type="button"
          onClick={onDone}
          className="btn-secondary text-meta"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <form
      className="card p-card-pad space-y-6"
      aria-label={`Edit ${year} awards`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!problem) submit();
      }}
    >
      <section className="space-y-2">
        <h2 className="text-meta font-medium text-content">
          Top {AWARD_RANK_MAX}
        </h2>
        <p className="text-micro text-content-subtle">
          Number 1 is your Game of the Year. Pick as many or as few as you like.
        </p>
        {draft.ranking.length > 0 && (
          <ol className="divide-y divide-line border border-line rounded-control">
            {draft.ranking.map((game, i) => (
              <li key={game.id} className="flex items-center gap-2 px-3 py-1.5">
                <span className="w-6 text-right font-display text-content-subtle">
                  {i + 1}
                </span>
                <span className="flex-1 text-meta text-content truncate">
                  {game.title}
                </span>
                <RowControls
                  label={game.title}
                  index={i}
                  count={draft.ranking.length}
                  onMove={(by) => setRanking(moveItem(draft.ranking, i, by))}
                  onRemove={() =>
                    setRanking(draft.ranking.filter((_, j) => j !== i))
                  }
                />
              </li>
            ))}
          </ol>
        )}
        {draft.ranking.length < AWARD_RANK_MAX && unranked.length > 0 && (
          <select
            aria-label="Add a game to the ranking"
            value=""
            onChange={(e) => {
              const game = known.get(e.target.value);
              if (game) setRanking([...draft.ranking, game]);
            }}
            className="input-field w-auto text-meta px-2 py-1.5"
          >
            <option value="">
              {draft.ranking.length === 0
                ? "Pick your Game of the Year…"
                : `Add number ${draft.ranking.length + 1}…`}
            </option>
            {unranked.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-meta font-medium text-content">Awards</h2>
        <p className="text-micro text-content-subtle">
          Name your own categories, like Best Soundtrack or Biggest Surprise.
        </p>
        {draft.categories.map((category, i) => (
          <div key={category.key} className="flex flex-wrap items-center gap-2">
            <input
              value={category.name}
              maxLength={AWARD_NAME_MAX}
              placeholder="Award name"
              aria-label={`Award ${i + 1} name`}
              onChange={(e) =>
                setCategories(
                  draft.categories.map((c, j) =>
                    j === i ? { ...c, name: e.target.value } : c,
                  ),
                )
              }
              className="input-field flex-1 min-w-[10rem] text-meta px-2 py-1.5"
            />
            <select
              aria-label={`Winner of award ${i + 1}`}
              value={category.game?.id ?? ""}
              onChange={(e) =>
                setCategories(
                  draft.categories.map((c, j) =>
                    j === i
                      ? { ...c, game: known.get(e.target.value) ?? null }
                      : c,
                  ),
                )
              }
              className="input-field w-auto max-w-full text-meta px-2 py-1.5"
            >
              <option value="">Pick a winner…</option>
              {[...known.values()].map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
            <RowControls
              label={category.name.trim() || `award ${i + 1}`}
              index={i}
              count={draft.categories.length}
              onMove={(by) => setCategories(moveItem(draft.categories, i, by))}
              onRemove={() =>
                setCategories(draft.categories.filter((_, j) => j !== i))
              }
            />
          </div>
        ))}
        {draft.categories.length < AWARD_CATEGORY_MAX && (
          <button
            type="button"
            onClick={() =>
              setCategories([
                ...draft.categories,
                { name: "", game: null, key: nextKey.current++ },
              ])
            }
            className="btn-secondary text-meta py-1.5"
          >
            Add an award
          </button>
        )}
      </section>

      {(problem ?? error) && (
        <p role="alert" className="text-meta text-danger-text">
          {error ? errorMessage(error) : problem}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || problem != null}
          className="btn-primary text-meta py-1.5"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="btn-secondary text-meta py-1.5"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

interface RowControlsProps {
  label: string;
  index: number;
  count: number;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}

function RowControls({
  label,
  index,
  count,
  onMove,
  onRemove,
}: RowControlsProps) {
  return (
    <span className="flex items-center gap-0.5">
      <button
        type="button"
        aria-label={`Move ${label} up`}
        disabled={index === 0}
        onClick={() => onMove(-1)}
        className="btn-icon disabled:opacity-30"
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={`Move ${label} down`}
        disabled={index === count - 1}
        onClick={() => onMove(1)}
        className="btn-icon disabled:opacity-30"
      >
        ↓
      </button>
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        className="btn-icon btn-icon-danger"
      >
        ✕
      </button>
    </span>
  );
}
