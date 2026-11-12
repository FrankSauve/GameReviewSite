const linkClass =
  "underline underline-offset-2 hover:text-content-muted transition-colors duration-theme";

/** On every page, since game data shows on nearly every page. */
export function SiteFooter() {
  return (
    <footer className="max-w-6xl mx-auto px-4 pb-8 text-micro text-content-subtle">
      Game data from the Steam store and{" "}
      <a
        href="https://thegamesdb.net"
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        TheGamesDB
      </a>
      .
    </footer>
  );
}
