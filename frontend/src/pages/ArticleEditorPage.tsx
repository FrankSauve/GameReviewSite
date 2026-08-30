import { useEffect, useId, useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { Link, useNavigate, useParams } from "react-router-dom";
import { GET_ARTICLE } from "../graphql/queries";
import { CREATE_ARTICLE, UPDATE_ARTICLE } from "../graphql/mutations";
import type { Article } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { articlePath } from "../lib/links";
import { Markdown } from "../components/Markdown";

/**
 * Writing an article, and editing one: the two differ only in which mutation runs,
 * whether the fields start empty, and what the button says.
 *
 * The plain textarea is temporary — this form should adopt the MarkdownEditor
 * from #46 once that lands.
 */

/** Kept in step with ARTICLE_CONTENT_MAX in backend/src/resolvers/article.ts. */
const CONTENT_MAX = 50000;
const TITLE_MAX = 200;

export function ArticleEditorPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const { user, signIn } = useAuth();
  const titleId = useId();
  const bodyId = useId();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [published, setPublished] = useState(true);
  const [previewing, setPreviewing] = useState(false);

  const { data, loading: loadingExisting } = useQuery<{ article: Article | null }>(
    GET_ARTICLE,
    { variables: { id }, skip: !editing }
  );
  const existing = data?.article;

  // Fills the form once the article arrives. Keyed on the id so switching between
  // two edit URLs reloads rather than keeping the first one's body.
  useEffect(() => {
    if (!existing) return;
    setTitle(existing.title);
    setContent(existing.content);
    setPublished(Boolean(existing.publishedAt));
  }, [existing?.id]);

  const done = (article?: Article | null) => {
    navigate(article ? articlePath(article) : "/articles");
  };

  const [createArticle, { loading: creating, error: createError }] = useMutation<{
    createArticle: Article;
  }>(CREATE_ARTICLE, {
    refetchQueries: ["GetArticles"],
    onCompleted: (result) => done(result.createArticle),
  });

  const [updateArticle, { loading: updating, error: updateError }] = useMutation<{
    updateArticle: Article;
  }>(UPDATE_ARTICLE, {
    refetchQueries: ["GetArticles"],
    onCompleted: (result) => done(result.updateArticle),
  });

  if (!user) {
    return (
      <p className="text-sm text-gray-500 text-center py-12">
        <button
          onClick={() => signIn()}
          className="text-violet-400 hover:text-violet-300 font-medium"
        >
          Sign in
        </button>{" "}
        to write an article.
      </p>
    );
  }

  if (editing && loadingExisting) {
    return <div className="card p-8 max-w-3xl mx-auto h-64 animate-pulse" />;
  }

  if (editing && !existing) {
    return (
      <div className="card p-12 text-center space-y-3 max-w-3xl mx-auto">
        <p className="text-gray-400 font-medium">This article is not here</p>
        <Link to="/articles" className="text-sm text-violet-400 hover:text-violet-300">
          Back to the articles
        </Link>
      </div>
    );
  }

  // The server refuses the mutation anyway; without this the form still fills
  // in with somebody else's article and every save fails.
  if (editing && existing && existing.author && existing.author.id !== user.id) {
    return (
      <div className="card p-12 text-center space-y-3 max-w-3xl mx-auto">
        <p className="text-gray-400 font-medium">This article is not yours to edit</p>
        <Link to={articlePath(existing)} className="text-sm text-violet-400 hover:text-violet-300">
          Read it instead
        </Link>
      </div>
    );
  }

  const canSubmit = title.trim() !== "" && content.trim() !== "";
  const saving = creating || updating;
  const error = createError ?? updateError;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const input = { title: title.trim(), content: content.trim(), published };
    if (editing && existing) {
      void updateArticle({ variables: { id: existing.id, input } });
    } else {
      void createArticle({ variables: { input } });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-gray-100 flex items-center gap-2">
        <span className="w-1 h-5 bg-violet-500 rounded-full inline-block" />
        {editing ? "Edit article" : "Write an article"}
      </h1>

      <div>
        <label htmlFor={titleId} className="block text-sm font-medium text-gray-400 mb-1.5">
          Title
        </label>
        <input
          id={titleId}
          className="input-field"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TITLE_MAX}
          placeholder="Our manifesto"
          required
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <label htmlFor={bodyId} className="block text-sm font-medium text-gray-400">
            Body
          </label>
          <button
            type="button"
            onClick={() => setPreviewing((p) => !p)}
            disabled={!content.trim()}
            className="text-xs text-violet-400 hover:text-violet-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
          >
            {previewing ? "Write" : "Preview"}
          </button>
        </div>

        {previewing ? (
          <div className="input-field min-h-[16rem] text-sm text-gray-300 leading-relaxed overflow-y-auto">
            <Markdown>{content}</Markdown>
          </div>
        ) : (
          <textarea
            id={bodyId}
            className="input-field resize-none"
            rows={18}
            placeholder="Write in Markdown…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={CONTENT_MAX}
            required
          />
        )}

        <div className="flex items-baseline justify-between mt-1">
          <p className="text-xs text-gray-600">
            Markdown: **bold**, *italic*, - lists, &gt; quotes
          </p>
          <p className="text-xs text-gray-600">
            {content.length}/{CONTENT_MAX}
          </p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-400">
        <input
          type="checkbox"
          checked={published}
          onChange={(e) => setPublished(e.target.checked)}
          className="accent-violet-500"
        />
        Publish it. Leave this off to keep it a draft only you can read.
      </label>

      {error && (
        <p className="text-red-400 text-sm bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
          {error.graphQLErrors[0]?.message ?? error.message}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving || !canSubmit} className="btn-primary">
          {saving ? "Saving…" : editing ? "Save changes" : "Publish"}
        </button>
        <Link
          to={editing && existing ? articlePath(existing) : "/articles"}
          className="text-sm text-gray-500 hover:text-gray-300"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
