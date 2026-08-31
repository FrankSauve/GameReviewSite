import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Rewrites the address bar to a page's canonical, slug-bearing path once the
 * entity has loaded, so a UUID link does not stay a UUID.
 */
export function useCanonicalPath(canonical: string | null): void {
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    if (!canonical || canonical === pathname) return;
    void navigate(`${canonical}${search}${hash}`, { replace: true });
  }, [canonical, pathname, search, hash, navigate]);
}
