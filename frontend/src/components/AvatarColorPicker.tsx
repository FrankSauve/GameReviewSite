import { useCallback, useRef, useState } from "react";
import { useMutation } from "@apollo/client";
import { UPDATE_PROFILE } from "../graphql/mutations";
import { useDismiss } from "../hooks/useDismiss";
import {
  AVATAR_COLORS,
  AVATAR_COLOR_KEYS,
  avatarColor,
  type AvatarColor,
} from "../lib/avatarColor";
import { Avatar, type AvatarUser } from "./Avatar";

/** The owner's avatar, doubling as the swatch picker. Saves on pick. */
export function AvatarColorPicker({ user }: { user: AvatarUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, close);

  const [updateProfile, { loading, error }] = useMutation(UPDATE_PROFILE, {
    onCompleted: close,
    // Reported below, so the promise must not also reject unhandled.
    onError: () => undefined,
  });

  const current = avatarColor(user);

  const pick = (color: AvatarColor) => {
    void updateProfile({ variables: { input: { avatarColor: color } } });
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Change avatar colour"
        aria-expanded={open}
        className="block rounded-pill ring-offset-2 ring-offset-surface hover:ring-2 hover:ring-accent-hover focus:outline-none focus:ring-2 focus:ring-accent-hover transition-shadow duration-theme"
      >
        <Avatar user={user} size={16} />
      </button>

      {open && (
        <div className="absolute z-20 mt-2 w-max left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0 popover p-3">
          <div className="grid grid-cols-6 gap-2">
            {AVATAR_COLOR_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => pick(key)}
                disabled={loading}
                aria-label={key}
                aria-pressed={key === current}
                className={`w-7 h-7 rounded-pill ${AVATAR_COLORS[key]} disabled:opacity-50 ${
                  key === current
                    ? "ring-2 ring-content ring-offset-2 ring-offset-surface"
                    : "hover:ring-2 hover:ring-line-strong ring-offset-2 ring-offset-surface"
                }`}
              />
            ))}
          </div>
          {error && (
            <p className="text-danger-text text-xs mt-2 max-w-[12rem]">
              {error.graphQLErrors[0]?.message ?? error.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
