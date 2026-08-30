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

export function TextDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data, loading } = useQuery<{ article: Article | null }>(GET_ARTICLE, {
    variables: { id },
  });

  const [deleteArticle, { loading: deleting }] = useMutation(DELETE_ARTICLE, {
    // The index is a separate query and would otherwise still list the text
    // that no longer exists.
    refetchQueries: ["GetArticles"],
    onCompleted: () => navigate("/texts"),
  });

  if (loading) {
    return (
      <div className="card p-8 animate-pulse space-y-4 max-w-3xl mx-auto">
        <div className="h-6 bg-gray-800 rounded w-2/3" />
        <div className="h-3 bg-gray-800 rounded w-1/4" />
        <div className="h-3 bg-gray-800 rounded" />
        <div className="h-3 bg-gray-800 rounded w-5/6" />
      </div>
    );
  }

  const article = data?.article;
  if (!article) {
    return (
      <div className="card p-12 text-center space-y-3 max-w-3xl mx-auto">
        <p className="text-4xl">📜</p>
        <p className="text-gray-400 font-medium">This text is not here</p>
        <p className="text-sm text-gray-600">
          It may have been deleted, or it may still be a draft.
        </p>
        <Link to="/texts" className="text-sm text-violet-400 hover:text-violet-300">
          Back to the texts
        </Link>
      </div>
    );
  }

  // The server already refuses to return somebody else's draft, so this only
  // decides whether to offer the controls, never whether the text is readable.
  const isAuthor = Boolean(user && article.author && user.id === article.author.id);

  return (
    <article className="max-w-3xl mx-auto space-y-6">
      <header className="space-y-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-100">{article.title}</h1>
          {!article.publishedAt && (
            <span className="text-[0.65rem] uppercase tracking-wide font-semibold text-amber-400 border border-amber-800 rounded px-1.5 py-0.5">
              Draft
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500">
          <Link
            to={userPath(article.author)}
            className="text-violet-400 hover:text-violet-300"
          >
            {article.author?.username ?? "unknown"}
          </Link>
          {" · "}
          {formatDate(article.publishedAt ?? article.createdAt)}
        </p>
      </header>

      <div className="card p-6 sm:p-8 text-gray-300 leading-relaxed">
        <Markdown>{article.content}</Markdown>
      </div>

      <div className="flex items-center justify-between">
        <Link to="/texts" className="text-sm text-gray-500 hover:text-gray-300">
          ← All texts
        </Link>
        {isAuthor && (
          <div className="flex items-center gap-4">
            <Link
              to={`/texts/${article.slug ?? article.id}/edit`}
              className="text-sm text-violet-400 hover:text-violet-300"
            >
              Edit
            </Link>
            <button
              onClick={() => {
                if (window.confirm("Delete this text? This cannot be undone."))
                  void deleteArticle({ variables: { id: article.id } });
              }}
              disabled={deleting}
              className="text-sm text-gray-500 hover:text-red-400 transition-colors"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
