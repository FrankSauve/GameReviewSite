import { useQuery } from "@apollo/client";
import { Link, useSearchParams } from "react-router-dom";
import { GET_ARTICLES } from "../graphql/queries";
import type { Article } from "../types";
import { articlePath } from "../lib/links";
import { useAuth } from "../contexts/AuthContext";
import { Pagination } from "../components/Pagination";

/**
 * The articles index. The server decides whose drafts are in it; this page only
 * labels them, so a draft cannot be mistaken for something published.
 */

const PAGE_SIZE = 20;

/** The date an article went out, or the day it was started while it is a draft. */
function dateLine(article: Article): string {
  const stamp = article.publishedAt ?? article.createdAt;
  if (!stamp) return "";
  return new Date(stamp).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function ArticlesPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const requested = parseInt(params.get("page") ?? "1", 10);
  const page = Number.isFinite(requested) && requested > 1 ? requested - 1 : 0;

  const { data, loading } = useQuery<{
    articles: Article[];
    articlesCount: number;
  }>(GET_ARTICLES, {
    variables: { limit: PAGE_SIZE, offset: page * PAGE_SIZE },
  });

  const articles = data?.articles ?? [];
  const total = data?.articlesCount ?? 0;

  const goTo = (next: number) => {
    setParams(next === 0 ? {} : { page: String(next + 1) });
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="section-head text-xl">Articles</h1>
        {user && (
          <Link to="/articles/new" className="btn-primary text-sm py-1.5 px-3">
            Write an article
          </Link>
        )}
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card p-5 animate-pulse space-y-3">
              <div className="h-4 skeleton-bar w-1/2" />
              <div className="h-3 skeleton-bar w-1/4" />
            </div>
          ))}
        </div>
      )}

      {!loading && articles.length === 0 && (
        <div className="empty-state space-y-3">
          <p className="text-4xl">📜</p>
          <p className="text-content-muted font-medium">Nothing written yet</p>
          <p className="text-sm text-content-faint">
            Manifestos, essays, anything that is not a review goes here.
          </p>
        </div>
      )}

      {!loading && articles.length > 0 && (
        <>
          <ul className="space-y-3">
            {articles.map((article) => (
              <li
                key={article.id}
                className="card p-5 hover:border-accent-subtle-border transition-colors duration-theme"
              >
                <Link to={articlePath(article)} className="block space-y-1">
                  <div className="flex items-baseline gap-2">
                    <h2 className="font-display text-content">
                      {article.title}
                    </h2>
                    {!article.publishedAt && (
                      <span className="text-[0.65rem] uppercase tracking-wide font-semibold text-warning-text border border-warning-border rounded px-1.5 py-0.5">
                        Draft
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-content-faint">
                    {article.author?.username ?? "unknown"} ·{" "}
                    {dateLine(article)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            totalPages={Math.ceil(total / PAGE_SIZE)}
            onChange={goTo}
            label="Articles pages"
          />
        </>
      )}
    </div>
  );
}
