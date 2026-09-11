import { useEffect, useId, useState } from "react";
import { useMutation, useQuery } from "@apollo/client";
import { Link, useNavigate, useParams } from "react-router-dom";
import { GET_ARTICLE } from "../graphql/queries";
import { CREATE_ARTICLE, UPDATE_ARTICLE } from "../graphql/mutations";
import type { Article } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { articlePath } from "../lib/links";
import { Markdown } from "../components/Markdown";

/** Kept in step with ARTICLE_CONTENT_MAX in backend/src/resolvers/article.ts. */
const CONTENT_MAX = 50000;
/** Write and Preview share it, so switching tabs does not resize the form. */
const BODY_HEIGHT = "min-h-[28rem]";
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

  const { data, loading: loadingExisting } = useQuery<{
    article: Article | null;
  }>(GET_ARTICLE, { variables: { id }, skip: !editing });
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
    void navigate(article ? articlePath(article) : "/articles");
  };

  const [createArticle, { loading: creating, error: createError }] =
    useMutation<{
      createArticle: Article;
    }>(CREATE_ARTICLE, {
      refetchQueries: ["GetArticles"],
      onCompleted: (result) => done(result.createArticle),
    });

  const [updateArticle, { loading: updating, error: updateError }] =
    useMutation<{
      updateArticle: Article;
    }>(UPDATE_ARTICLE, {
      refetchQueries: ["GetArticles"],
      onCompleted: (result) => done(result.updateArticle),
    });

  if (!user) {
    return (
      <p className="text-sm text-content-subtle text-center py-12">
        <button
          onClick={() => signIn()}
          className="text-accent-subtle-text hover:text-accent-subtle-text font-medium"
        >
          Sign in
        </button>{" "}
        to write an article.
      </p>
    );
  }

  if (editing && loadingExisting) {
    return <div className="card p-8 page-column h-64 animate-pulse" />;
  }

  if (editing && !existing) {
    return (
      <div className="empty-state space-y-3 max-w-3xl mx-auto">
        <p className="text-content-muted font-medium">
          This article is not here
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

  // The server refuses the mutation anyway; without this the form still fills
  // in with somebody else's article and every save fails.
  if (
    editing &&
    existing &&
    existing.author &&
    existing.author.id !== user.id
  ) {
    return (
      <div className="empty-state space-y-3 max-w-3xl mx-auto">
        <p className="text-content-muted font-medium">
          This article is not yours to edit
        </p>
        <Link
          to={articlePath(existing)}
          className="text-sm text-accent-subtle-text hover:text-accent-subtle-text"
        >
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
    <form onSubmit={handleSubmit} className="page-column space-y-4">
      <h1 className="section-head text-xl">
        {editing ? "Edit article" : "Write an article"}
      </h1>

      <div>
        <label htmlFor={titleId} className="field-label text-base">
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
          <label
            htmlFor={bodyId}
            className="block text-base font-medium text-content-muted"
          >
            Body
          </label>
          <button
            type="button"
            onClick={() => setPreviewing((p) => !p)}
            disabled={!content.trim()}
            className="text-sm text-accent-subtle-text hover:text-accent-subtle-text disabled:text-content-faint disabled:cursor-not-allowed transition-colors duration-theme"
          >
            {previewing ? "Write" : "Preview"}
          </button>
        </div>

        {previewing ? (
          <div
            className={`input-field ${BODY_HEIGHT} text-content-body leading-relaxed overflow-y-auto`}
          >
            <Markdown>{content}</Markdown>
          </div>
        ) : (
          <textarea
            id={bodyId}
            className={`input-field resize-none ${BODY_HEIGHT}`}
            rows={18}
            placeholder="Write in Markdown…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={CONTENT_MAX}
            required
          />
        )}

        <div className="flex items-baseline justify-between mt-1">
          <p className="text-sm text-content-subtle">
            Markdown: **bold**, *italic*, - lists, &gt; quotes
          </p>
          <p className="text-sm text-content-subtle">
            {content.length}/{CONTENT_MAX}
          </p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-content-muted">
        <input
          type="checkbox"
          checked={published}
          onChange={(e) => setPublished(e.target.checked)}
          className="accent-accent-hover"
        />
        Publish it. Leave this off to keep it a draft only you can read.
      </label>

      {error && (
        <p className="text-danger-text text-sm bg-danger-subtle/20 border border-danger-subtle-border rounded-control px-3 py-2">
          {error.graphQLErrors[0]?.message ?? error.message}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || !canSubmit}
          className="btn-primary"
        >
          {saving ? "Saving…" : editing ? "Save changes" : "Publish"}
        </button>
        <Link
          to={editing && existing ? articlePath(existing) : "/articles"}
          className="text-sm text-content-subtle hover:text-content-body"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
