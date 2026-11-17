import type { ImagePalette, ImageToken } from "./awardsImagePalettes.js";

export type ImageKind = "portrait" | "wide";

/** Portrait is the download; wide is the `og:image`, at the 1.91:1 previews crop to. */
export const IMAGE_SIZES: Record<ImageKind, { width: number; height: number }> =
  {
    portrait: { width: 1080, height: 1350 },
    wide: { width: 1200, height: 630 },
  };

export interface ImageGame {
  title: string;
  /** Already fetched and inlined, or null to draw the titled placeholder. */
  cover: string | null;
}

export interface AwardsImageData {
  username: string;
  slug: string;
  year: number;
  /** The site's host, printed as the image's mark. */
  site: string;
  ranking: { rank: number; game: ImageGame }[];
  categories: { name: string; game: ImageGame }[];
}

type Style = Record<string, string | number>;
type Child = ImageNode | string;

/** Shaped like a React element, which is all satori reads: no React needed. */
export interface ImageNode {
  type: string;
  key: null;
  props: {
    style: Style;
    children?: Child | Child[];
    src?: string;
    width?: number;
    height?: number;
  };
}

/** Steam's header art, which is most of the catalogue. */
const COVER_RATIO = 215 / 460;

/** Past this many entries below the hero, tiles switch to compact rows. */
const CROWDED_AT = 12;
/** Two rows of full award tiles is all the portrait height holds beside the hero. */
const FULL_TILES_MAX = 6;

function h(
  style: Style,
  ...children: (Child | Child[] | null | false | undefined)[]
): ImageNode {
  const kids = children
    .flat()
    .filter((c): c is Child => c !== null && c !== false && c !== undefined);
  return {
    type: "div",
    key: null,
    // Satori lays out every div as flex and adds padding outside the width
    // unless told otherwise.
    props: {
      style: { display: "flex", boxSizing: "border-box", ...style },
      children: kids.length === 1 && kids[0] !== undefined ? kids[0] : kids,
    },
  };
}

function painter(palette: ImagePalette) {
  return (token: ImageToken, alpha = 1): string => {
    const rgb = palette[token].split(" ").join(", ");
    return alpha === 1 ? `rgb(${rgb})` : `rgba(${rgb}, ${alpha})`;
  };
}
type Paint = ReturnType<typeof painter>;

function cover(paint: Paint, game: ImageGame, width: number, radius: number) {
  const height = Math.round(width * COVER_RATIO);
  if (game.cover) {
    return {
      type: "img",
      key: null,
      props: {
        src: game.cover,
        width,
        height,
        style: { width, height, objectFit: "cover", borderRadius: radius },
      },
    } satisfies ImageNode;
  }
  return h(
    {
      width,
      height,
      borderRadius: radius,
      background: paint("surface-raised"),
      alignItems: "center",
      justifyContent: "center",
      padding: 8,
      color: paint("text-subtle"),
      fontSize: Math.max(12, Math.round(width / 14)),
      fontWeight: 600,
      textAlign: "center",
      overflow: "hidden",
    },
    game.title,
  );
}

const ONE_LINE: Style = {
  display: "block",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const clamp = (lines: number): Style => ({
  display: "block",
  lineClamp: lines,
});

function label(text: string, color: string, size: number): ImageNode {
  return h(
    {
      fontSize: size,
      fontWeight: 700,
      letterSpacing: 3,
      color,
      textTransform: "uppercase",
    },
    text,
  );
}

function heading(paint: Paint, data: AwardsImageData, size: number) {
  return h(
    { flexDirection: "column" },
    label(`${data.username}'s`, paint("accent-subtle-text"), size * 0.3),
    h(
      {
        fontSize: size,
        fontWeight: 900,
        letterSpacing: -1.5,
        lineHeight: 1,
        marginTop: 6,
      },
      `${data.year} Game Awards`,
    ),
  );
}

function frame(
  paint: Paint,
  kind: ImageKind,
  style: Style,
  ...children: (ImageNode | null | false | undefined)[]
) {
  const { width, height } = IMAGE_SIZES[kind];
  return h(
    {
      width,
      height,
      flexDirection: "column",
      background: paint("bg"),
      backgroundImage: `radial-gradient(circle at 88% 0%, ${paint("accent-subtle-bg")}, ${paint("bg")} 58%)`,
      color: paint("text"),
      fontFamily: "Inter Tight",
      ...style,
    },
    ...children,
  );
}

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
    heading(paint, data, 72),
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
    h(
      {
        justifyContent: "space-between",
        alignItems: "center",
        borderTop: `1px solid ${paint("line")}`,
        paddingTop: 18,
        fontSize: 18,
        fontWeight: 500,
        color: paint("text-subtle"),
      },
      // Separate boxes: adjacent strings would be laid out as one run of text.
      h({}, data.site),
      h({}, `/users/${data.slug}/awards/${data.year}`),
    ),
  );
}

function wide(paint: Paint, data: AwardsImageData): ImageNode {
  const PAD = 44;
  const INNER = IMAGE_SIZES.wide.width - PAD * 2;
  const GAP = 10;
  const [goty, ...rest] = data.ranking;
  const n = data.categories.length;
  const stripWidth = Math.min(
    200,
    Math.floor((INNER - GAP * (rest.length - 1)) / Math.max(1, rest.length)),
  );

  // A year of named awards and no ranking leads with its first award.
  const lead = goty
    ? { caption: "Game of the Year", game: goty.game, more: n }
    : data.categories[0] && {
        caption: data.categories[0].name,
        game: data.categories[0].game,
        more: n - 1,
      };

  return frame(
    paint,
    "wide",
    { padding: PAD, justifyContent: "space-between" },
    h(
      { justifyContent: "space-between", alignItems: "flex-start" },
      heading(paint, data, 52),
      h(
        { fontSize: 18, fontWeight: 500, color: paint("text-subtle") },
        data.site,
      ),
    ),
    lead &&
      h(
        { gap: 32, alignItems: "center" },
        cover(paint, lead.game, rest.length > 0 ? 440 : 520, 12),
        h(
          { flexDirection: "column", flex: 1, gap: 10 },
          label(lead.caption, paint("warning-text"), 18),
          h(
            { fontSize: 46, fontWeight: 800, lineHeight: 1.08, ...clamp(3) },
            lead.game.title,
          ),
          lead.more > 0 &&
            h(
              { fontSize: 20, color: paint("text-muted"), marginTop: 6 },
              `+ ${lead.more} award${lead.more === 1 ? "" : "s"}`,
            ),
        ),
      ),
    rest.length > 0 &&
      h(
        { gap: GAP },
        rest.map((r) =>
          h(
            { position: "relative" },
            cover(paint, r.game, stripWidth, 6),
            h(
              {
                position: "absolute",
                left: 0,
                top: 0,
                padding: "2px 7px",
                borderRadius: "6px 0 6px 0",
                background: paint("bg", 0.85),
                color: paint("text"),
                fontSize: 15,
                fontWeight: 800,
              },
              `#${r.rank}`,
            ),
          ),
        ),
      ),
  );
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

export function imageFile(year: number, kind: ImageKind): string {
  return `${year}${kind === "wide" ? "-wide" : ""}.png`;
}
