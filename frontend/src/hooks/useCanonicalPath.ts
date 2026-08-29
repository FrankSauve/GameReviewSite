import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Rewrites the address bar to a page's canonical, slug-bearing path once the
 * entity has loaded, so a UUID link does not stay a UUID. `replace` rather than
 * `push`, so back returns to where the visitor came from rather than to this same
 * page under its old name. `null` while the query is in flight does nothing.
 */
export function useCanonicalPath(canonical: string | null): void {
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    if (!canonical || canonical === pathname) return;
    navigate(`${canonical}${search}${hash}`, { replace: true });
  }, [canonical, pathname, search, hash, navigate]);
}
