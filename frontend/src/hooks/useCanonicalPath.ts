import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Rewrites the address bar to a page's canonical, slug-bearing path.
 *
 * Every lookup accepts a UUID as well as a slug, so a link shared before slugs
 * existed still resolves and still renders the right page. This is what stops it
 * staying a UUID from then on: once the entity has loaded and its slug is known,
 * the URL is replaced in place. `replace` rather than `push`, so the back button
 * returns to wherever the visitor came from instead of to the same page under its
 * old name.
 *
 * Passing `null` — while the query is still in flight, or when it found nothing —
 * does nothing, which is what keeps this from fighting a redirect somewhere else.
 * The search string and hash are preserved.
 */
export function useCanonicalPath(canonical: string | null): void {
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    if (!canonical || canonical === pathname) return;
    navigate(`${canonical}${search}${hash}`, { replace: true });
  }, [canonical, pathname, search, hash, navigate]);
}
