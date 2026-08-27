import { useMutation } from "@apollo/client";
import { SET_REVIEW_GROUPING } from "../graphql/mutations";
import { GROUPING_LABELS, type Grouping, toGrouping } from "../lib/grouping";

interface DefaultViewPickerProps {
  current: Grouping;
}

/**
 * Lets the profile's owner choose which view their own profile opens on.
 *
 * Only rendered on your own profile. The mutation takes no user id — the server
 * reads the row from the session — so there is no version of this control that
 * could write somebody else's preference even if it were rendered elsewhere.
 */
export function DefaultViewPicker({ current }: DefaultViewPickerProps) {
  const [setGrouping, { loading, error }] = useMutation(SET_REVIEW_GROUPING);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-gray-500">Visitors see</span>
      <div className="flex gap-1">
        {(Object.keys(GROUPING_LABELS) as Grouping[]).map((grouping) => {
          const active = grouping === current;
          return (
            <button
              key={grouping}
              type="button"
              disabled={loading || active}
              aria-pressed={active}
              onClick={() =>
                void setGrouping({
                  variables: { grouping: toGrouping(grouping) },
                  // The server returns the updated User, and Apollo normalises it
                  // by id, so both this control and the page header follow without
                  // a refetch.
                })
              }
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                active
                  ? "bg-violet-900/60 text-violet-300 border border-violet-800"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700 border border-transparent"
              }`}
            >
              {GROUPING_LABELS[grouping]}
            </button>
          );
        })}
      </div>
      <span className="text-xs text-gray-600">first</span>
      {error && (
        <span className="text-xs text-red-400">
          {error.graphQLErrors[0]?.message ?? "Could not save that."}
        </span>
      )}
    </div>
  );
}
