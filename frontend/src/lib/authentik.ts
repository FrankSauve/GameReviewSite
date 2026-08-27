/**
 * Endpoints exposed by the authentik proxy outpost on this same hostname.
 * The reverse proxy leaves /outpost.goauthentik.io unauthenticated so the
 * sign-in and sign-out flows can be reached.
 */
const OUTPOST = "/outpost.goauthentik.io";

/** Sends the browser through authentik's login flow, including 2FA. */
export function startSignIn(returnTo: string = window.location.pathname): void {
  const rd = `${window.location.origin}${returnTo}`;
  window.location.assign(`${OUTPOST}/start?rd=${encodeURIComponent(rd)}`);
}

/** Ends the authentik session, not just the local view of it. */
export function startSignOut(): void {
  window.location.assign(`${OUTPOST}/sign_out`);
}
