import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@apollo/client/react";
import { GET_USER_AWARD_YEARS, GET_USER_AWARDS } from "../graphql/queries";
import type { ReviewSummary } from "../lib/grouping";
import type { PickableGame } from "../lib/favorites";
import { awardableYears, defaultAwardYear, gamesPlayedIn } from "../lib/awards";
import { awardsImagePath, gamePath, userPath } from "../lib/links";
import { GameCover } from "./GameCover";
import { YearAwardsEditor } from "./YearAwardsEditor";

type AwardGame = PickableGame & { posterUrl?: string | null };

export interface YearAwardsData {
  id: string;
  year: number;
  ranking: { id: string; rank: number; game: AwardGame }[];
  categories: { id: string; name: string; game: AwardGame }[];
}

interface YearAwardsProps {
  profile: { id: string; slug?: string | null };
  isOwnProfile: boolean;
  summaries: ReviewSummary[];
  /** The year the URL names, or null to open on the default year. */
  urlYear: number | null;
}

export function YearAwards({
  profile,
  isOwnProfile,
  summaries,
  urlYear,
}: YearAwardsProps) {
  const navigate = useNavigate();
  const {
    data: yearsData,
    loading: yearsLoading,
    error: yearsError,
  } = useQuery<{
    user: { id: string; awardYears: number[] } | null;
  }>(GET_USER_AWARD_YEARS, { variables: { id: profile.id } });

  const awardYears = yearsData?.user?.awardYears ?? [];
  // Played years are offered to the owner to fill in; a visitor is offered only
  // years that have awards.
  const played = isOwnProfile ? summaries : [];
  const year =
    urlYear ?? (yearsData ? defaultAwardYear(played, awardYears) : null);
  // The URL's year is offered even when nothing was played then.
  const years = awardableYears(
    played,
    year == null ? awardYears : [...awardYears, year],
  );

  if (year == null) {
    if (yearsLoading) return <AwardsSkeleton />;
    if (yearsError) {
      return (
        <div className="card p-10 text-center text-content-muted">
          Couldn't load the awards.
        </div>
      );
    }
    return (
      <div className="card p-10 text-center space-y-2">
        <p className="text-3xl">🏆</p>
        <p className="text-content-muted">
          {isOwnProfile
            ? summaries.length > 0
              ? "Awards are picked from the games you've reviewed in a year. Add the year you played to a review to start."
              : "Awards are picked from the games you've reviewed in a year. Review a game to start."
            : "No awards yet."}
        </p>
      </div>
    );
  }

  // A save can change which year the bare tab opens on, so editing first puts
  // the year in the URL.
  const pinYear = () => {
    if (urlYear == null)
      void navigate(userPath(profile, `awards/${year}`), { replace: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <select
          aria-label="Awards year"
          value={year}
          onChange={(e) =>
            void navigate(userPath(profile, `awards/${e.target.value}`))
          }
          className="input-field w-auto text-meta px-2 py-1.5"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      {/* Keyed by account and year, so an open editor's draft never carries over. */}
      <YearAwardsForYear
        key={`${profile.id}:${year}`}
        userId={profile.id}
        year={year}
        isOwnProfile={isOwnProfile}
        eligible={gamesPlayedIn(summaries, year)}
        pinYear={pinYear}
        imagePath={awardsImagePath(profile, year)}
      />
    </div>
  );
}

interface YearAwardsForYearProps {
  userId: string;
  year: number;
  isOwnProfile: boolean;
  eligible: PickableGame[];
  pinYear: () => void;
  /** Served by the backend, not the SPA: a plain link, never a router Link. */
  imagePath: string;
}

function YearAwardsForYear({
  userId,
  year,
  isOwnProfile,
  eligible,
  pinYear,
  imagePath,
}: YearAwardsForYearProps) {
  const [editing, setEditing] = useState(false);
  const { data, loading, error } = useQuery<{
    user: { id: string; awards: YearAwardsData } | null;
  }>(GET_USER_AWARDS, { variables: { id: userId, year } });

  if (loading && !data) return <AwardsSkeleton />;
  const awards = data?.user?.awards;
  if (error || !awards) {
    return (
      <div className="card p-10 text-center text-content-muted">
        Couldn't load the awards for {year}.
      </div>
    );
  }

  if (editing) {
    return (
      <YearAwardsEditor
        userId={userId}
        year={year}
        awards={awards}
        eligible={eligible}
        onDone={() => setEditing(false)}
      />
    );
  }

  const [goty, ...rest] = awards.ranking;
  const empty = !goty && awards.categories.length === 0;
  const editButton = isOwnProfile && (
    <button
      type="button"
      onClick={() => {
        pinYear();
        setEditing(true);
      }}
      className={empty ? "btn-primary text-meta" : "btn-secondary text-meta"}
    >
      {empty ? `Pick your ${year} awards` : "Edit awards"}
    </button>
  );

  if (empty) {
    return (
      <div className="card p-10 text-center space-y-3">
        <p className="text-3xl">🏆</p>
        <p className="text-content-muted">
          {isOwnProfile
            ? `You haven't picked any awards for ${year} yet.`
            : `No awards for ${year}.`}
        </p>
        {editButton}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <a href={imagePath} download className="btn-secondary text-meta">
          Download image
        </a>
        {editButton}
      </div>

      {goty && (
        <section aria-label={`Game of the Year ${year}`}>
          <Link
            to={gamePath(goty.game)}
            className="card card-interactive flex items-center gap-4 p-card-pad"
          >
            <div className="w-24 sm:w-32 aspect-[2/3] rounded-control overflow-hidden bg-surface-raised shrink-0">
              <GameCover game={goty.game} size="md" art="poster" decorative />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="text-micro font-medium uppercase tracking-wide text-accent-subtle-text">
                🏆 Game of the Year {year}
              </p>
              <p className="font-display text-title text-content">
                {goty.game.title}
              </p>
            </div>
          </Link>
        </section>
      )}

      {rest.length > 0 && (
        <section aria-label="Runners-up" className="space-y-2">
          <h2 className="text-meta font-medium text-content-muted">
            The rest of the top {awards.ranking.length}
          </h2>
          <ol className="card divide-y divide-line overflow-hidden">
            {rest.map(({ id, rank, game }) => (
              <li key={id}>
                <Link
                  to={gamePath(game)}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-surface-raised transition-colors duration-theme"
                >
                  <span className="w-6 text-right font-display text-content-subtle">
                    {rank}
                  </span>
                  <div className="w-8 h-11 rounded-chip overflow-hidden bg-surface-raised shrink-0">
                    <GameCover game={game} size="sm" art="poster" decorative />
                  </div>
                  <span className="text-meta text-content truncate">
                    {game.title}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {awards.categories.length > 0 && (
        <section aria-label="Awards" className="space-y-2">
          <h2 className="text-meta font-medium text-content-muted">Awards</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {awards.categories.map(({ id, name, game }) => (
              <div key={id} className="space-y-1.5">
                <Link to={gamePath(game)} className="block">
                  <div className="relative aspect-video rounded-control overflow-hidden border border-line bg-surface">
                    <GameCover game={game} size="md" decorative />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-scrim/95 via-scrim/70 to-transparent px-1.5 pb-1 pt-5">
                      <p className="text-[11px] font-semibold text-content leading-tight line-clamp-2">
                        {game.title}
                      </p>
                    </div>
                  </div>
                </Link>
                <p className="text-micro text-content-muted leading-tight">
                  {name}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AwardsSkeleton() {
  return (
    <div aria-busy="true" className="space-y-3">
      <div className="card h-40 animate-pulse" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="card h-12 animate-pulse" />
      ))}
    </div>
  );
}
