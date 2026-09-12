/** @type {import('tailwindcss').Config} */

/** Palette tokens are RGB channel triplets, so `<alpha-value>` still works. */
const palette = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Colour names are semantic, never a hue: the palette on <html> decides
      // what `accent` is. A `violet-600` in a component is a bug, because no
      // palette can reach it. See the token layer in src/index.css.
      colors: {
        bg: palette("bg"),
        surface: {
          DEFAULT: palette("surface"),
          raised: palette("surface-raised"),
        },
        line: {
          DEFAULT: palette("line"),
          strong: palette("line-strong"),
        },
        content: {
          DEFAULT: palette("text"),
          body: palette("text-body"),
          muted: palette("text-muted"),
          subtle: palette("text-subtle"),
          faint: palette("text-faint"),
          /* Text over a cover image or an avatar gradient — always light, and
             never the page ground, which is why it is not a rung. */
          "on-art": palette("text-on-art"),
        },
        accent: {
          DEFAULT: palette("accent"),
          hover: palette("accent-hover"),
          active: palette("accent-active"),
          contrast: palette("accent-contrast"),
          border: palette("accent-border"),
          subtle: palette("accent-subtle-bg"),
          "subtle-border": palette("accent-subtle-border"),
          "subtle-text": palette("accent-subtle-text"),
        },
        danger: {
          DEFAULT: palette("danger"),
          hover: palette("danger-hover"),
          contrast: palette("danger-contrast"),
          text: palette("danger-text"),
          subtle: palette("danger-subtle-bg"),
          "subtle-border": palette("danger-subtle-border"),
        },
        warning: {
          text: palette("warning-text"),
          border: palette("warning-border"),
        },
        rating: {
          high: palette("rating-high"),
          mid: palette("rating-mid"),
          low: palette("rating-low"),
        },
        scrim: palette("scrim"),
      },
      borderRadius: {
        card: "var(--radius-card)",
        control: "var(--radius-control)",
        chip: "var(--radius-chip)",
        pill: "var(--radius-pill)",
      },
      borderWidth: {
        theme: "var(--card-border-width)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-hover": "var(--shadow-card-hover)",
        popover: "var(--shadow-popover)",
      },
      // `font-display`, `font-numeric` and `font-meta` are utilities in
      // index.css, because each sets weight or tracking alongside the family.
      fontFamily: {
        sans: "var(--font-body)",
        body: "var(--font-body)",
      },
      // The six type roles. A component names the role, never a size, so a
      // theme owns both the sizes and the ratios between them. A `text-sm` in a
      // component is a bug for the same reason a `violet-600` is.
      fontSize: {
        display: [
          "var(--size-display)",
          { lineHeight: "var(--leading-display)" },
        ],
        title: ["var(--size-title)", { lineHeight: "var(--leading-title)" }],
        body: ["var(--size-body)", { lineHeight: "var(--leading-body)" }],
        meta: ["var(--size-meta)", { lineHeight: "var(--leading-meta)" }],
        micro: ["var(--size-micro)", { lineHeight: "var(--leading-micro)" }],
        label: ["var(--size-label)", { lineHeight: "var(--leading-label)" }],
      },
      // Structural rhythm only. An incidental `gap-1` stays a literal.
      spacing: {
        "card-pad": "var(--space-card-pad)",
        stack: "var(--space-stack)",
        "row-gap": "var(--space-row-gap)",
        "page-y": "var(--space-page-y)",
      },
      maxWidth: {
        measure: "var(--measure)",
      },
      transitionDuration: {
        theme: "var(--motion-duration)",
      },
      ringColor: {
        DEFAULT: palette("ring"),
      },
    },
  },
  plugins: [],
};
