const linkClass =
  "underline underline-offset-2 hover:text-content-muted transition-colors duration-theme";

/** On every page: RAWG's terms ask for a link wherever its data shows, and
 *  older games' descriptions are still RAWG's. */
export function SiteFooter() {
  return (
    <footer className="max-w-6xl mx-auto px-4 pb-8 text-micro text-content-subtle">
      Game data from the Steam store,{" "}
      <a
        href="https://thegamesdb.net"
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        TheGamesDB
      </a>{" "}
      and{" "}
      <a
        href="https://rawg.io"
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        RAWG
      </a>
      .
    </footer>
  );
}
