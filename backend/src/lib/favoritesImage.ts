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
  painter,
  wideCard,
  type ImageGame,
  type ImageKind,
  type ImageNode,
  type Paint,
} from "./shareImage.js";

export interface FavoritesImageData {
  username: string;
  slug: string;
  /** The site's host, printed as the image's mark. */
  site: string;
  /** In grid order, each under its category's label. */
  picks: { label: string; game: ImageGame }[];
}

const TITLE = "Favourites";

/** The preview's strip holds as many as the awards preview's top 10 does. */
const STRIP_MAX = 9;

/** Columns for n picks. Four columns of five rows is the whole grid of 20. */
function columns(n: number): number {
  if (n === 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  return 4;
}

function portrait(paint: Paint, data: FavoritesImageData): ImageNode {
  const PAD = 56;
  const INNER = IMAGE_SIZES.portrait.width - PAD * 2;
  const cols = columns(data.picks.length);
  const tight = cols === 4;
  const gap = tight ? 14 : 18;
  const padding = tight ? 10 : 14;
  const width = (INNER - gap * (cols - 1)) / cols;

  const tile = (pick: FavoritesImageData["picks"][number]) =>
    h(
      {
        width,
        flexDirection: "column",
        gap: tight ? 6 : 10,
        background: paint("surface"),
        border: `1px solid ${paint("line")}`,
        borderRadius: 12,
        padding,
      },
      cover(paint, pick.game, width - padding * 2, 8),
      h(
        {
          fontSize: tight ? 12 : 15,
          fontWeight: 700,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          color: paint("warning-text"),
          // Two lines, not one: at four columns the longest labels do not fit.
          ...clamp(2),
        },
        pick.label,
      ),
      h(
        {
          fontSize: tight ? 16 : cols === 1 ? 40 : 22,
          fontWeight: 700,
          lineHeight: 1.15,
          ...clamp(2),
        },
        pick.game.title,
      ),
    );

  return frame(
    paint,
    "portrait",
    { padding: PAD },
    heading(paint, data.username, TITLE, 72),
    h(
      { flex: 1, alignItems: "center", paddingTop: 32, paddingBottom: 32 },
      h({ flexWrap: "wrap", gap }, data.picks.map(tile)),
    ),
    footer(paint, data.site, `/users/${data.slug}/favorites`),
  );
}

/** The picks a layout draws: a cover it leaves out is never fetched. */
export function drawnPicks<P>(kind: ImageKind, picks: readonly P[]): P[] {
  return kind === "wide" ? picks.slice(0, STRIP_MAX + 1) : [...picks];
}

function wide(paint: Paint, data: FavoritesImageData): ImageNode {
  const [lead, ...strip] = drawnPicks("wide", data.picks);
  const more = data.picks.length - 1;
  return wideCard(paint, {
    username: data.username,
    title: TITLE,
    site: data.site,
    lead: lead && {
      caption: lead.label,
      game: lead.game,
      more: more > 0 ? `+ ${more} more pick${more === 1 ? "" : "s"}` : null,
    },
    strip: strip.map((p) => ({ game: p.game })),
  });
}

export function favoritesImageTree(
  kind: ImageKind,
  data: FavoritesImageData,
  palette: ImagePalette,
): ImageNode {
  const paint = painter(palette);
  return kind === "portrait" ? portrait(paint, data) : wide(paint, data);
}

/** The key is American, as the tab's is: `favorites.png` and `favorites-wide.png`. */
const FILE_NAME = "favorites";

export function parseFavoritesImageFile(file: string): ImageKind | null {
  if (file === imageFile(FILE_NAME, "portrait")) return "portrait";
  if (file === imageFile(FILE_NAME, "wide")) return "wide";
  return null;
}

/** Under SHARE_IMAGE_PREFIX, where the image router is mounted. */
export const FAVORITES_IMAGE_SEGMENT = "/favorites";
export const FAVORITES_IMAGE_PREFIX = `${SHARE_IMAGE_PREFIX}${FAVORITES_IMAGE_SEGMENT}`;

/** Mirrored by favoritesImagePath in frontend/src/lib/links.ts; this copy is authoritative. */
export function favoritesImagePath(slug: string, kind: ImageKind): string {
  return `${FAVORITES_IMAGE_PREFIX}/${encodeURIComponent(slug)}/${imageFile(FILE_NAME, kind)}`;
}
