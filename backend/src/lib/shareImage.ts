import type { ImagePalette, ImageToken } from "./shareImagePalettes.js";

export type ImageKind = "portrait" | "wide";

/** Portrait is the download; wide is the `og:image`, at the 1.91:1 previews crop to. */
export const IMAGE_SIZES: Record<ImageKind, { width: number; height: number }> =
  {
    portrait: { width: 1080, height: 1350 },
    wide: { width: 1200, height: 630 },
  };

/** Served only by the backend, so the proxy needs no pattern to route it. */
export const SHARE_IMAGE_PREFIX = "/images";

export interface ImageGame {
  title: string;
  /** Already fetched and inlined, or null to draw the titled placeholder. */
  cover: string | null;
}

export type Style = Record<string, string | number>;
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

export function h(
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

export function painter(palette: ImagePalette) {
  return (token: ImageToken, alpha = 1): string => {
    const rgb = palette[token].split(" ").join(", ");
    return alpha === 1 ? `rgb(${rgb})` : `rgba(${rgb}, ${alpha})`;
  };
}
export type Paint = ReturnType<typeof painter>;

export function cover(
  paint: Paint,
  game: ImageGame,
  width: number,
  radius: number,
) {
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

export const ONE_LINE: Style = {
  display: "block",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
export const clamp = (lines: number): Style => ({
  display: "block",
  lineClamp: lines,
});

export function label(text: string, color: string, size: number): ImageNode {
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

/** `alice's` over the image's title. */
export function heading(
  paint: Paint,
  username: string,
  title: string,
  size: number,
) {
  return h(
    { flexDirection: "column" },
    label(`${username}'s`, paint("accent-subtle-text"), size * 0.3),
    h(
      {
        fontSize: size,
        fontWeight: 900,
        letterSpacing: -1.5,
        lineHeight: 1,
        marginTop: 6,
      },
      title,
    ),
  );
}

export function frame(
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

/** The portrait's last line: the site, and the page the image is of. */
export function footer(paint: Paint, site: string, path: string): ImageNode {
  return h(
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
    h({}, site),
    h({}, path),
  );
}

export interface WideCard {
  username: string;
  title: string;
  site: string;
  /** The one game drawn large, under its caption. */
  lead?: { caption: string; game: ImageGame; more: string | null } | undefined;
  strip: { game: ImageGame; badge?: string }[];
}

/** The link preview: a heading, one game drawn large, and a strip of the rest. */
export function wideCard(paint: Paint, card: WideCard): ImageNode {
  const PAD = 44;
  const INNER = IMAGE_SIZES.wide.width - PAD * 2;
  const GAP = 10;
  const { lead, strip } = card;
  const stripWidth = Math.min(
    200,
    Math.floor((INNER - GAP * (strip.length - 1)) / Math.max(1, strip.length)),
  );

  return frame(
    paint,
    "wide",
    { padding: PAD, justifyContent: "space-between" },
    h(
      { justifyContent: "space-between", alignItems: "flex-start" },
      heading(paint, card.username, card.title, 52),
      h(
        { fontSize: 18, fontWeight: 500, color: paint("text-subtle") },
        card.site,
      ),
    ),
    lead &&
      h(
        { gap: 32, alignItems: "center" },
        cover(paint, lead.game, strip.length > 0 ? 440 : 520, 12),
        h(
          { flexDirection: "column", flex: 1, gap: 10 },
          label(lead.caption, paint("warning-text"), 18),
          h(
            { fontSize: 46, fontWeight: 800, lineHeight: 1.08, ...clamp(3) },
            lead.game.title,
          ),
          lead.more !== null &&
            h(
              { fontSize: 20, color: paint("text-muted"), marginTop: 6 },
              lead.more,
            ),
        ),
      ),
    strip.length > 0 &&
      h(
        { gap: GAP },
        strip.map((s) =>
          h(
            { position: "relative" },
            cover(paint, s.game, stripWidth, 6),
            s.badge !== undefined &&
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
                s.badge,
              ),
          ),
        ),
      ),
  );
}

/** `<name>.png` is the download, `<name>-wide.png` the preview. */
export function imageFile(name: string, kind: ImageKind): string {
  return `${name}${kind === "wide" ? "-wide" : ""}.png`;
}
