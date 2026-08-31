/**
 * Sign-in and sign-out as ordinary navigations to this app's own backend.
 *
 * These paths are same-origin in production, where SWAG serves the SPA and the
 * API from one hostname. Locally the API is on another port and they are not
 * reachable, which is what AUTH_DEV_IDENTITY is for.
 */

const LOGIN_PATH = "/auth/login";
const LOGOUT_PATH = "/auth/logout";

/** Kept separate from the navigation so it can be tested without a browser. */
export function loginUrl(returnTo: string): string {
  return `${LOGIN_PATH}?returnTo=${encodeURIComponent(returnTo)}`;
}

/**
 * Ends the session and reports where to send the browser next: authentik's
 * end-session endpoint, so its session ends too rather than only ours, or `/`
 * when there was nothing to end.
 */
export async function signOutTarget(
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  try {
    const res = await fetchImpl(LOGOUT_PATH, {
      method: "POST",
      credentials: "same-origin",
      // Not decoration: it is what makes this a preflighted request, which is
      // what Apollo's and the backend's CSRF checks rely on.
      headers: { "content-type": "application/json" },
    });
    const body = (await res.json()) as { endSessionUrl?: string | null };
    return body.endSessionUrl ?? "/";
  } catch {
    // The cookie may well be gone regardless. Reloading is the honest response:
    // it re-runs `me` and shows whatever the real state turned out to be.
    return "/";
  }
}

/** Sends the browser through authentik's login flow, including 2FA. */
export function startSignIn(
  returnTo: string = `${window.location.pathname}${window.location.search}`,
): void {
  window.location.assign(loginUrl(returnTo));
}

export function startSignOut(): void {
  void signOutTarget().then((target) => window.location.assign(target));
}
