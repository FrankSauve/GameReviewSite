import { useState } from "react";
import { useMutation } from "@apollo/client";
import { UPDATE_PROFILE } from "../graphql/mutations";
import { Markdown } from "./Markdown";
import { MarkdownEditor } from "./MarkdownEditor";

/** Matches `BIO_MAX` in `backend/src/resolvers/user.ts`, which enforces it. */
export const BIO_MAX = 1000;

interface ProfileBioProps {
  bio?: string | null | undefined;
  isOwnProfile: boolean;
}

/** Read-only for visitors, editable in place by its owner. */
export function ProfileBio({ bio, isOwnProfile }: ProfileBioProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const [updateProfile, { loading, error, reset }] = useMutation(UPDATE_PROFILE, {
    onCompleted: () => setEditing(false),
    // Reported below, so the promise must not also reject unhandled.
    onError: () => undefined,
  });

  const startEditing = () => {
    setDraft(bio ?? "");
    // A failed save's message does not describe this attempt.
    reset();
    setEditing(true);
  };

  const save = () => {
    void updateProfile({ variables: { input: { bio: draft } } });
  };

  if (editing) {
    return (
      <div className="space-y-2">
        <MarkdownEditor
          value={draft}
          onChange={setDraft}
          rows={4}
          maxLength={BIO_MAX}
          placeholder="How do you score games? What kind of player are you?"
        />
        {error && (
          <p className="text-red-400 text-xs">
            {error.graphQLErrors[0]?.message ?? error.message}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={loading}
            className="btn-primary text-sm py-1.5 px-3"
          >
            {loading ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="btn-secondary text-sm py-1.5 px-3"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Nothing written and nobody here who could write it: render nothing at all.
  if (!bio && !isOwnProfile) return null;

  if (!bio) {
    return (
      <button
        onClick={startEditing}
        className="text-sm text-violet-400 hover:text-violet-300 transition-colors"
      >
        Add a bio
      </button>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-sm text-gray-400 leading-relaxed text-left">
        <Markdown>{bio}</Markdown>
      </div>
      {isOwnProfile && (
        <button
          onClick={startEditing}
          className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
        >
          Edit bio
        </button>
      )}
    </div>
  );
}
