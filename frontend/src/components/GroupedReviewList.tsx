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
            <p className="font-semibold text-content group-hover:text-accent-subtle-text transition-colors duration-theme truncate text-sm">
              {game?.title ?? "Unknown game"}
            </p>
            <p className="text-xs text-content-faint truncate">
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
              className={`font-numeric text-lg font-extrabold ${ratingColor(item.rating)}`}
            >
              {formatRating(item.rating)}
            </span>
            <span className="text-xs text-content-faint">/10</span>
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
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key}>
          {group.label && (
            <div className="flex items-baseline gap-2 mb-2 pb-1 border-b border-line">
              <h3 className="font-display text-lg text-content">
                {group.label}
              </h3>
              <span className="text-xs text-content-faint">
                {group.items.length}
                {group.items.length === 1 ? " game" : " games"}
              </span>
              {showGroupAverage && (
                <span
                  className={`text-xs font-semibold ${ratingColor(group.average)}`}
                >
                  avg {formatRating(Math.round(group.average * 10) / 10)}
                </span>
              )}
              {group.hours != null && (
                <span className="text-xs text-content-faint ml-auto">
                  {formatHours(Math.round(group.hours * 10) / 10)}
                </span>
              )}
            </div>
          )}
          <div className="space-y-2">
            {group.items.map((item) => (
              <ReviewRow key={item.id} item={item} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
