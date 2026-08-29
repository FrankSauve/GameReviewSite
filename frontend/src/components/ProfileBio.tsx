import { useState } from "react";
import { useMutation } from "@apollo/client";
import { UPDATE_PROFILE } from "../graphql/mutations";
import { Markdown } from "./Markdown";
import { MarkdownEditor } from "./MarkdownEditor";

/**
 * The bio on a profile: read-only for visitors, editable in place by its owner.
 *
 * Rendered as Markdown through the same component reviews use, because somebody
 * describing how they score games will want a list of what a 7 means to them,
 * and a second flavour of formatting on the one site would be worse than either.
 *
 * Kept out of `UserProfilePage` so that the page stays a layout: this owns the
 * editing state, the mutation and the two empty cases, none of which the rest of
 * the profile has any reason to know about.
 */

/** Matches `BIO_MAX` in `backend/src/resolvers/user.ts`, which enforces it. */
export const BIO_MAX = 1000;

interface ProfileBioProps {
  bio?: string | null;
  isOwnProfile: boolean;
}

export function ProfileBio({ bio, isOwnProfile }: ProfileBioProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const [updateProfile, { loading, error }] = useMutation(UPDATE_PROFILE, {
    onCompleted: () => setEditing(false),
  });

  const startEditing = () => {
    setDraft(bio ?? "");
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

  // Nothing written, and nobody here who could write it: render nothing at all
  // rather than an empty region on every visitor's view of the profile.
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
