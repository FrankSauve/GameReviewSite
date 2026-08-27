/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // Inter first for anyone who has it installed locally, then the
        // platform's own UI font. Nothing is fetched from a third party: the
        // stylesheet this used to pull from fonts.googleapis.com handed every
        // visitor's IP address and Referer to Google before the page had
        // rendered, on a site whose whole point is being self-hosted. Inter was
        // picked to look like a system UI font, so the fallback is close.
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "Noto Sans",
          "sans-serif",
          "Apple Color Emoji",
          "Segoe UI Emoji",
        ],
      },
    },
  },
  plugins: [],
};
