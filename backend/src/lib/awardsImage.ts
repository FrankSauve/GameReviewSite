import type { ImagePalette } from "./shareImagePalettes.js";
import {
  IMAGE_SIZES,
  SHARE_IMAGE_PREFIX,
  clamp,
  cover,
  footer,
  frame,
  h,
  heading,
  imageFile,
  label,
  ONE_LINE,
  painter,
  wideCard,
  type ImageGame,
  type ImageKind,
  type ImageNode,
  type Paint,
} from "./shareImage.js";

export interface AwardsImageData {
  username: string;
  slug: string;
  year: number;
  /** The site's host, printed as the image's mark. */
  site: string;
  ranking: { rank: number; game: ImageGame }[];
  categories: { name: string; game: ImageGame }[];
}

/** Past this many entries below the hero, tiles switch to compact rows. */
const CROWDED_AT = 12;
/** Two rows of full award tiles is all the portrait height holds beside the hero. */
const FULL_TILES_MAX = 6;

function portrait(paint: Paint, data: AwardsImageData): ImageNode {
  const PAD = 56;
  const INNER = IMAGE_SIZES.portrait.width - PAD * 2;
  const GAP = 14;
  const [goty, ...rest] = data.ranking;
  const cats = data.categories;
  const crowded =
    rest.length + cats.length > CROWDED_AT || cats.length > FULL_TILES_MAX;
  const few = rest.length <= 3 && !crowded;

  const hero =
    goty &&
    h(
      {
        gap: 28,
        alignItems: "center",
        background: paint("surface"),
        border: `1px solid ${paint("line")}`,
        borderRadius: 16,
        padding: 20,
      },
      cover(paint, goty.game, crowded ? 400 : 520, 10),
      h(
        { flexDirection: "column", flex: 1, gap: 10 },
        label("Game of the Year", paint("warning-text"), crowded ? 16 : 18),
        h(
          {
            fontSize: crowded ? 36 : 44,
            fontWeight: 800,
            lineHeight: 1.1,
            ...clamp(3),
          },
          goty.game.title,
        ),
      ),
    );

  const rankWidth = (INNER - GAP * 2) / 3;
  const ranks =
    rest.length > 0 &&
    h(
      { flexWrap: "wrap", gap: GAP },
      rest.map((r) =>
        h(
          { width: rankWidth, alignItems: "center", gap: 12 },
          h(
            {
              width: 34,
              justifyContent: "flex-end",
              fontSize: 26,
              fontWeight: 800,
              color: paint("accent-subtle-text"),
            },
            String(r.rank),
          ),
          cover(paint, r.game, crowded ? 96 : few ? 140 : 120, 6),
          h(
            {
              flex: 1,
              fontSize: few ? 22 : 17,
              fontWeight: 600,
              lineHeight: 1.2,
              ...clamp(2),
            },
            r.game.title,
          ),
        ),
      ),
    );

  let awards: ImageNode | null = null;
  if (cats.length > 0) {
    const cols = crowded ? 3 : Math.min(3, Math.max(2, cats.length));
    const gap = crowded ? 10 : GAP;
    const width = (INNER - gap * (cols - 1)) / cols;
    const tile = (c: AwardsImageData["categories"][number]) =>
      crowded
        ? h(
            {
              width,
              gap: 12,
              alignItems: "center",
              background: paint("surface"),
              borderRadius: 10,
              padding: 8,
            },
            cover(paint, c.game, 104, 6),
            h(
              { flexDirection: "column", flex: 1, gap: 3, minWidth: 0 },
              h(
                {
                  fontSize: 14,
                  fontWeight: 700,
                  lineHeight: 1.15,
                  color: paint("warning-text"),
                  ...clamp(2),
                },
                c.name,
              ),
              h(
                {
                  fontSize: 14,
                  fontWeight: 500,
                  color: paint("text-muted"),
                  ...ONE_LINE,
                },
                c.game.title,
              ),
            ),
          )
        : h(
            {
              width,
              flexDirection: "column",
              gap: 10,
              background: paint("surface"),
              borderRadius: 12,
              padding: 12,
            },
            cover(paint, c.game, width - 24, 8),
            h(
              {
                fontSize: 18,
                fontWeight: 700,
                lineHeight: 1.15,
                color: paint("warning-text"),
                ...clamp(2),
              },
              c.name,
            ),
            h(
              {
                fontSize: 16,
                fontWeight: 500,
                color: paint("text-muted"),
                ...ONE_LINE,
              },
              c.game.title,
            ),
          );
    awards = h(
      { flexDirection: "column", gap: 14 },
      label("Awards", paint("text-subtle"), 16),
      h({ flexWrap: "wrap", gap }, cats.map(tile)),
    );
  }

  return frame(
    paint,
    "portrait",
    { padding: PAD },
    heading(paint, data.username, `${data.year} Game Awards`, 72),
    h(
      {
        flexDirection: "column",
        flex: 1,
        justifyContent: "center",
        gap: crowded ? 30 : 40,
      },
      hero,
      ranks,
      awards,
    ),
    footer(paint, data.site, `/users/${data.slug}/awards/${data.year}`),
  );
}

/** The entries a layout draws: a cover it leaves out is never fetched. */
export function drawnEntries<R, C>(
  kind: ImageKind,
  data: { ranking: readonly R[]; categories: readonly C[] },
): { ranking: R[]; categories: C[] } {
  if (kind === "portrait")
    return { ranking: [...data.ranking], categories: [...data.categories] };
  // A year of named awards and no ranking leads with its first award.
  return {
    ranking: [...data.ranking],
    categories: data.ranking.length > 0 ? [] : data.categories.slice(0, 1),
  };
}

function wide(paint: Paint, data: AwardsImageData): ImageNode {
  const drawn = drawnEntries("wide", data);
  const [goty, ...rest] = drawn.ranking;
  const first = drawn.categories[0];
  const n = data.categories.length;
  const awards = (more: number) =>
    more > 0 ? `+ ${more} award${more === 1 ? "" : "s"}` : null;

  const lead = goty
    ? { caption: "Game of the Year", game: goty.game, more: awards(n) }
    : first && {
        caption: first.name,
        game: first.game,
        more: awards(n - 1),
      };

  return wideCard(paint, {
    username: data.username,
    title: `${data.year} Game Awards`,
    site: data.site,
    lead,
    strip: rest.map((r) => ({ game: r.game, badge: `#${r.rank}` })),
  });
}

export function awardsImageTree(
  kind: ImageKind,
  data: AwardsImageData,
  palette: ImagePalette,
): ImageNode {
  const paint = painter(palette);
  return kind === "portrait" ? portrait(paint, data) : wide(paint, data);
}

/** `2026.png` is the download, `2026-wide.png` the preview. */
export function parseImageFile(
  file: string,
): { year: number; kind: ImageKind } | null {
  const match = /^(\d{4})(-wide)?\.png$/.exec(file);
  if (!match) return null;
  return {
    year: Number(match[1]),
    kind: match[2] ? "wide" : "portrait",
  };
}

/** Under SHARE_IMAGE_PREFIX, where the image router is mounted. */
export const AWARDS_IMAGE_SEGMENT = "/awards";
export const AWARDS_IMAGE_PREFIX = `${SHARE_IMAGE_PREFIX}${AWARDS_IMAGE_SEGMENT}`;

/** Mirrored by awardsImagePath in frontend/src/lib/links.ts; this copy is authoritative. */
export function awardsImagePath(
  slug: string,
  year: number,
  kind: ImageKind,
): string {
  return `${AWARDS_IMAGE_PREFIX}/${encodeURIComponent(slug)}/${imageFile(String(year), kind)}`;
}
