import { useSearchParams } from "react-router-dom";

/**
 * The page number in `?page=`: one-based in the URL, zero-based here, matching
 * the `offset = page * size` the queries do. Clamped low but not high — the
 * total is unknown until the query resolves.
 */
export function usePageParam(): [number, (page: number) => void] {
  const [params, setParams] = useSearchParams();

  const requested = parseInt(params.get("page") ?? "1", 10);
  const page = Number.isFinite(requested) && requested > 1 ? requested - 1 : 0;

  const goTo = (nextPage: number) => {
    const next = new URLSearchParams(params);
    // Page one is the bare URL, so it is not a second history entry.
    if (nextPage === 0) next.delete("page");
    else next.set("page", String(nextPage + 1));
    setParams(next);
    window.scrollTo({ top: 0 });
  };

  return [page, goTo];
}
