import { useEffect, useId, useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { Link, useNavigate, useParams } from "react-router-dom";
import { GET_ARTICLE, GET_ARTICLES } from "../graphql/queries";
import { CREATE_ARTICLE, UPDATE_ARTICLE } from "../graphql/mutations";
import type { Article } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { textPath } from "../lib/links";
import { Markdown } from "../components/Markdown";

/**
 * Writing a text, and editing one.
 *
 * One component for both because the two differ in exactly three places — which
 * mutation runs, whether the fields start empty, and what the button says — and
 * a second copy of a form with a preview toggle is a second copy to keep in step.
 *
 * The plain textarea is deliberate but temporary: #46 adds a proper Markdown
 * editor component, and this form should adopt it once that lands rather than
 * grow its own toolbar in the meantime.
 */

/** Kept in step with ARTICLE_CONTENT_MAX in backend/src/resolvers/article.ts,
 *  which is the side that enforces it. */
const CONTENT_MAX = 50000;
const TITLE_MAX = 200;

export function TextEditorPage() {
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

  // Fills the form once the text arrives. Keyed on the id so switching between
  // two edit URLs reloads rather than keeping the first one's body.
  useEffect(() => {
    if (!existing) return;
    setTitle(existing.title);
    setContent(existing.content);
    setPublished(Boolean(existing.publishedAt));
  }, [existing?.id]);

  const done = (article?: Article | null) => {
    navigate(article ? textPath(article) : "/texts");
  };

  const [createArticle, { loading: creating, error: createError }] = useMutation<{
    createArticle: Article;
  }>(CREATE_ARTICLE, {
    refetchQueries: [{ query: GET_ARTICLES, variables: { limit: 20, offset: 0 } }],
    onCompleted: (result) => done(result.createArticle),
  });

  const [updateArticle, { loading: updating, error: updateError }] = useMutation<{
    updateArticle: Article;
  }>(UPDATE_ARTICLE, {
    refetchQueries: [{ query: GET_ARTICLES, variables: { limit: 20, offset: 0 } }],
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
        to write a text.
      </p>
    );
  }

  if (editing && loadingExisting) {
    return <div className="card p-8 max-w-3xl mx-auto h-64 animate-pulse" />;
  }

  if (editing && !existing) {
    return (
      <div className="card p-12 text-center space-y-3 max-w-3xl mx-auto">
        <p className="text-gray-400 font-medium">This text is not here</p>
        <Link to="/texts" className="text-sm text-violet-400 hover:text-violet-300">
          Back to the texts
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
        {editing ? "Edit text" : "Write a text"}
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
          to={editing && existing ? textPath(existing) : "/texts"}
          className="text-sm text-gray-500 hover:text-gray-300"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
