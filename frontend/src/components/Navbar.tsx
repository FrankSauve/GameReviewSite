import { Link, useLocation } from "react-router-dom";
import { useApolloClient } from "@apollo/client";
import { useAuth } from "../contexts/AuthContext";
import { GameSearchBar } from "./GameSearchBar";
import { userPath } from "../lib/links";

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

  return (
    <header className="sticky top-0 z-40 bg-gray-950/80 backdrop-blur-md border-b border-gray-800">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
        {/* Logo */}
        <Link
          to="/"
          onClick={e => { if (location.pathname === "/") { e.preventDefault(); void apollo.refetchQueries({ include: "active" }); } }}
          className="flex items-center gap-2 font-extrabold text-lg text-gray-100 hover:text-violet-300 transition-colors shrink-0"
        >
          <span className="hidden sm:block">GameReviews</span>
        </Link>

        {/* Nav links */}
        <Link
          to="/games"
          className={navLink(location.pathname === "/games")}
        >
          Games
        </Link>
        <Link
          to="/reviewers"
          className={navLink(location.pathname === "/reviewers")}
        >
          Reviewers
        </Link>
        <Link
          to="/texts"
          className={navLink(location.pathname === "/texts")}
        >
          Texts
        </Link>

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
                {user.username[0].toUpperCase()}
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
