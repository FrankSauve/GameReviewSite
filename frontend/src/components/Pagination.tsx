/**
 * Page controls, shared by the review feed and the games library.
 *
 * The feed grew one of these inline, rendering a button per page. That is fine
 * at four pages and unusable at forty — the row wraps across the width of the
 * page and the current page is lost in it. Since the library needs the same
 * control over a list that only grows, the numbers are windowed here: first,
 * last, and the current page's immediate neighbours, with gaps elided.
 *
 * `page` is zero-based, matching the `offset = page * size` the queries do.
 */

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  /** Describes what is being paged, for screen readers. */
  label: string;
}

/** Page numbers to show, with `null` standing in for an elided run. */
export function pageItems(page: number, totalPages: number): (number | null)[] {
  const shown = new Set<number>([0, totalPages - 1, page - 1, page, page + 1]);
  const pages = [...shown].filter((p) => p >= 0 && p < totalPages).sort((a, b) => a - b);

  const items: (number | null)[] = [];
  let previous: number | null = null;
  for (const p of pages) {
    // A gap of exactly one is spelled out rather than elided: "1 … 3" is the
    // same width as "1 2 3" and hides a page for nothing.
    if (previous !== null && p - previous > 1) {
      items.push(p - previous === 2 ? p - 1 : null);
    }
    items.push(p);
    previous = p;
  }
  return items;
}

export function Pagination({ page, totalPages, onChange, label }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label={label}
      className="flex items-center justify-center gap-2 pt-4"
    >
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 0}
        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        ← Prev
      </button>

      <div className="flex items-center gap-1">
        {pageItems(page, totalPages).map((item, i) =>
          item === null ? (
            <span key={`gap-${i}`} className="px-1 text-sm text-gray-600 select-none">
              …
            </span>
          ) : (
            <button
              key={item}
              onClick={() => onChange(item)}
              aria-current={item === page ? "page" : undefined}
              className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                item === page
                  ? "bg-violet-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {item + 1}
            </button>
          )
        )}
      </div>

      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages - 1}
        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        Next →
      </button>
    </nav>
  );
}
