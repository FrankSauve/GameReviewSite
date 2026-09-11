import { useQuery, useMutation } from "@apollo/client";
import { Link, useNavigate, useParams } from "react-router-dom";
import { GET_ARTICLE } from "../graphql/queries";
import { DELETE_ARTICLE } from "../graphql/mutations";
import type { Article } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { userPath } from "../lib/links";
import { Markdown } from "../components/Markdown";

/** One text, rendered. No score, playtime or game beside it. */

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function ArticleDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data, loading } = useQuery<{ article: Article | null }>(GET_ARTICLE, {
    variables: { id },
  });

  const [deleteArticle, { loading: deleting }] = useMutation(DELETE_ARTICLE, {
    // The index is a separate query and would otherwise still list the article
    // that no longer exists.
    refetchQueries: ["GetArticles"],
    onCompleted: () => void navigate("/articles"),
  });

  if (loading) {
    return (
      <div className="card p-8 animate-pulse space-y-4 page-column">
        <div className="h-6 skeleton-bar w-2/3" />
        <div className="h-3 skeleton-bar w-1/4" />
        <div className="h-3 skeleton-bar" />
        <div className="h-3 skeleton-bar w-5/6" />
      </div>
    );
  }

  const article = data?.article;
  if (!article) {
    return (
      <div className="empty-state space-y-3 max-w-3xl mx-auto">
        <p className="text-4xl">📜</p>
        <p className="text-content-muted font-medium">
          This article is not here
        </p>
        <p className="text-sm text-content-faint">
          It may have been deleted, or it may still be a draft.
        </p>
        <Link
          to="/articles"
          className="text-sm text-accent-subtle-text hover:text-accent-subtle-text"
        >
          Back to the articles
        </Link>
      </div>
    );
  }

  // The server already refuses to return somebody else's draft, so this only
  // decides whether to offer the controls, never whether the article is readable.
  const isAuthor = Boolean(
    user && article.author && user.id === article.author.id,
  );

  return (
    <article className="page-column space-y-6">
      <header className="space-y-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h1 className="font-display text-2xl text-content">
            {article.title}
          </h1>
          {!article.publishedAt && (
            <span className="text-[0.65rem] uppercase tracking-wide font-semibold text-warning-text border border-warning-border rounded px-1.5 py-0.5">
              Draft
            </span>
          )}
        </div>
        <p className="text-sm text-content-subtle">
          <Link
            to={userPath(article.author)}
            className="text-accent-subtle-text hover:text-accent-subtle-text"
          >
            {article.author?.username ?? "unknown"}
          </Link>
          {" · "}
          {formatDate(article.publishedAt ?? article.createdAt)}
        </p>
      </header>

      <div className="card p-6 sm:p-8 text-content-body leading-relaxed">
        <Markdown>{article.content}</Markdown>
      </div>

      <div className="flex items-center justify-between">
        <Link
          to="/articles"
          className="text-sm text-content-subtle hover:text-content-body"
        >
          ← All articles
        </Link>
        {isAuthor && (
          <div className="flex items-center gap-4">
            <Link
              to={`/articles/${article.slug ?? article.id}/edit`}
              className="text-sm text-accent-subtle-text hover:text-accent-subtle-text"
            >
              Edit
            </Link>
            <button
              onClick={() => {
                if (window.confirm("Delete this text? This cannot be undone."))
                  void deleteArticle({ variables: { id: article.id } });
              }}
              disabled={deleting}
              className="text-sm text-content-subtle hover:text-danger-text transition-colors duration-theme"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
