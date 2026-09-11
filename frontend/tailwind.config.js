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
      // `font-display` and `font-numeric` are utilities in index.css, because
      // each sets weight and tracking alongside the family.
      fontFamily: {
        sans: "var(--font-body)",
        body: "var(--font-body)",
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
