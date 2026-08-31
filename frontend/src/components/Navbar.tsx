import { useCallback, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useApolloClient } from "@apollo/client";
import { useAuth } from "../contexts/AuthContext";
import { GameSearchBar } from "./GameSearchBar";
import { useDismiss } from "../hooks/useDismiss";
import { userPath } from "../lib/links";

const NAV_LINKS = [
  { to: "/games", label: "Games" },
  { to: "/reviewers", label: "Reviewers" },
  { to: "/articles", label: "Articles" },
] as const;

const MENU_ID = "primary-nav-menu";

/** Callers match on the exact path, so /games/elden-ring leaves the link dark. */
function navLink(active: boolean): string {
  return `text-sm font-medium shrink-0 transition-colors ${
    active ? "text-violet-300" : "text-gray-400 hover:text-gray-100"
  }`;
}

export function Navbar() {
  const location = useLocation();
  const apollo = useApolloClient();
  const { user, signIn, signOut } = useAuth();
  // The menu is open for one path only, so following a link closes it rather
  // than leaving it hanging over the page it navigated to.
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const menuOpen = openedAt === location.pathname;
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setOpenedAt(null), []);
  useDismiss(menuRef, closeMenu);

  return (
    <header className="sticky top-0 z-40 bg-gray-950/80 backdrop-blur-md border-b border-gray-800">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
        {/* Menu button (mobile only) */}
        <div className="relative shrink-0 sm:hidden" ref={menuRef}>
          <button
            type="button"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            aria-controls={MENU_ID}
            onClick={() => setOpenedAt(menuOpen ? null : location.pathname)}
            className="flex items-center justify-center w-9 h-9 -ml-1 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
          >
            <MenuIcon />
          </button>
          {menuOpen && (
            <nav
              id={MENU_ID}
              className="absolute top-full left-0 mt-2 min-w-40 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl shadow-black/60 z-50 overflow-hidden py-1"
            >
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={closeMenu}
                  className={`block px-4 py-2.5 hover:bg-gray-800 ${navLink(
                    location.pathname === link.to,
                  )}`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          )}
        </div>

        {/* Logo */}
        <Link
          to="/"
          onClick={(e) => {
            if (location.pathname === "/") {
              e.preventDefault();
              void apollo.refetchQueries({ include: "active" });
            }
          }}
          className="flex items-center gap-2 font-extrabold text-lg text-gray-100 hover:text-violet-300 transition-colors shrink-0"
        >
          {/* The link needs a label at every width; the full name costs the
              search bar too much room on a phone. */}
          <span className="hidden sm:block">GameReviews</span>
          <span className="sm:hidden">GR</span>
        </Link>

        {/* Nav links */}
        <div className="hidden sm:flex items-center gap-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={navLink(location.pathname === link.to)}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Search bar (fills available space) */}
        <GameSearchBar />

        {/* Auth area */}
        {user ? (
          <div className="flex items-center gap-3 shrink-0">
            <Link
              to={userPath(user)}
              className="flex items-center gap-2 bg-violet-900/40 border border-violet-800 rounded-full px-3 py-1.5 hover:bg-violet-900/70 hover:border-violet-600 transition-colors"
            >
              <span className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold text-white">
                {user.username.charAt(0).toUpperCase()}
              </span>
              <span className="text-sm font-medium text-violet-300 hidden sm:block">
                {user.username}
              </span>
            </Link>
            <button
              onClick={() => signOut()}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => signIn()}
              className="btn-primary text-sm py-1.5 px-3"
            >
              Sign in
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function MenuIcon() {
  return (
    <svg
      className="w-5 h-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 12h16M4 18h16"
      />
    </svg>
  );
}
