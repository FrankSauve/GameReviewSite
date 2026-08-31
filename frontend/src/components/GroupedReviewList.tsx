import { Link } from "react-router-dom";
import { formatRating, ratingColor } from "../lib/rating";
import { formatHours } from "../lib/playtime";
import type { ReviewGroup } from "../lib/grouping";
import { reviewPath } from "../lib/links";

function ReviewRow({ item }: { item: ReviewGroup["items"][number] }) {
  const game = item.game;

  return (
    <Link to={reviewPath(item)} className="group block">
      <article className="card overflow-hidden flex items-stretch hover:border-violet-700 hover:shadow-lg hover:shadow-violet-900/20 transition-all duration-200">
        <div className="w-14 sm:w-16 shrink-0 overflow-hidden">
          {game?.coverUrl ? (
            <img
              src={game.coverUrl}
              alt=""
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-b from-gray-800 to-gray-900 flex items-center justify-center">
              <span className="text-lg opacity-20">🎮</span>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 px-3 py-2.5 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-100 group-hover:text-violet-300 transition-colors truncate text-sm">
              {game?.title ?? "Unknown game"}
            </p>
            <p className="text-xs text-gray-600 truncate">
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
              className={`text-lg font-extrabold ${ratingColor(item.rating)}`}
            >
              {formatRating(item.rating)}
            </span>
            <span className="text-xs text-gray-700">/10</span>
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
            <div className="flex items-baseline gap-2 mb-2 pb-1 border-b border-gray-800">
              <h3 className="text-lg font-bold text-gray-100">{group.label}</h3>
              <span className="text-xs text-gray-600">
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
                <span className="text-xs text-gray-600 ml-auto">
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
