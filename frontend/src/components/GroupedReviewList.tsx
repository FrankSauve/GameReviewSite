import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { formatRating, ratingColor } from "../lib/rating";
import { formatHours } from "../lib/playtime";
import type { ReviewGroup } from "../lib/grouping";
import { reviewPath } from "../lib/links";
import { GameCover } from "./GameCover";

function ReviewRow({ item }: { item: ReviewGroup["items"][number] }) {
  const game = item.game;

  return (
    <Link to={reviewPath(item)} className="group block">
      <article className="card card-interactive overflow-hidden flex items-stretch">
        <div className="w-14 sm:w-16 shrink-0 overflow-hidden">
          <GameCover game={game} size="sm" decorative />
        </div>

        <div className="flex-1 min-w-0 px-3 py-2.5 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-content group-hover:text-accent-subtle-text transition-colors duration-theme truncate text-meta">
              {game?.title ?? "Unknown game"}
            </p>
            <p className="text-meta text-content-subtle truncate">
              {[
                game?.releaseYear ? `Released ${game.releaseYear}` : null,
                item.hoursPlayed != null ? formatHours(item.hoursPlayed) : null,
                item.commentCount > 0
                  ? `${item.commentCount} comment${item.commentCount === 1 ? "" : "s"}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          <div className="flex items-baseline gap-0.5 shrink-0">
            <span
              className={`font-numeric text-title font-extrabold ${ratingColor(item.rating)}`}
            >
              {formatRating(item.rating)}
            </span>
            <span className="text-micro text-content-subtle">/10</span>
          </div>
        </div>
      </article>
    </Link>
  );
}

interface GroupedReviewListProps {
  groups: ReviewGroup[];
  /** Score groups already state the score in the heading, so the average is noise there. */
  showGroupAverage: boolean;
}

export function GroupedReviewList({
  groups,
  showGroupAverage,
}: GroupedReviewListProps) {
  const idPrefix = useId();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  // An unlabelled group (Recent's single list) has no header to reopen it by.
  const collapsible = groups.filter((g) => g.label).map((g) => g.key);
  const allCollapsed =
    collapsible.length > 0 && collapsible.every((k) => collapsed.has(k));

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <div className="space-y-6">
      {collapsible.length > 0 && (
        <div className="flex justify-end -mb-3">
          <button
            type="button"
            onClick={() =>
              setCollapsed(allCollapsed ? new Set() : new Set(collapsible))
            }
            className="text-micro font-medium text-content-muted hover:text-accent-subtle-text transition-colors duration-theme"
          >
            {allCollapsed ? "Show all" : "Collapse all"}
          </button>
        </div>
      )}
      {groups.map((group, i) => {
        const open = !group.label || !collapsed.has(group.key);
        const listId = `${idPrefix}-${i}`;
        return (
          <section key={group.key}>
            {group.label && (
              // The button's ::after covers the row, so the whole header
              // toggles while the heading keeps only the label as its text.
              <div className="relative flex items-baseline gap-2 mb-2 pb-1 border-b border-line">
                <h3 className="font-display text-title text-content">
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={listId}
                    onClick={() => toggle(group.key)}
                    className="flex items-baseline gap-2 hover:text-accent-subtle-text transition-colors duration-theme after:absolute after:inset-0"
                  >
                    <svg
                      aria-hidden="true"
                      className={`w-4 h-4 self-center shrink-0 text-content-subtle transition-transform duration-theme ${open ? "" : "-rotate-90"}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                    {group.label}
                  </button>
                </h3>
                <span className="text-micro text-content-subtle">
                  {group.items.length}
                  {group.items.length === 1 ? " game" : " games"}
                </span>
                {showGroupAverage && (
                  <span
                    className={`text-micro font-semibold ${ratingColor(group.average)}`}
                  >
                    avg {formatRating(Math.round(group.average * 10) / 10)}
                  </span>
                )}
                {group.hours != null && (
                  <span className="text-micro text-content-subtle ml-auto">
                    {formatHours(Math.round(group.hours * 10) / 10)}
                  </span>
                )}
              </div>
            )}
            <div id={listId} hidden={!open} className="space-y-2">
              {open &&
                group.items.map((item) => (
                  <ReviewRow key={item.id} item={item} />
                ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
