import type { Request, RequestHandler } from "express";
import rateLimit from "express-rate-limit";

/**
 * Read at call time rather than module load so that a test can construct an
 * app under a different configuration without reimporting the module graph.
 */
export function isProduction(): boolean {
  return process.env["NODE_ENV"] === "production";
}

/**
 * Number of reverse proxies in front of this app.
 *
 * SWAG proxies straight to this service, so 1. Getting it wrong means every
 * rate limiter keys on the proxy's IP instead of the client's, so a single
 * abusive client would lock out everybody.
 */
export function trustProxyHops(): number {
  const parsed = parseInt(process.env["TRUST_PROXY_HOPS"] ?? "0", 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

const DEV_ORIGINS = ["http://localhost:5173", "http://localhost:3000"];

/**
 * Allowed browser origins.
 *
 * In the target deployment the SPA and the API share one hostname, so no
 * cross-origin access is needed and the default of `false` sends no CORS
 * headers at all.
 */
export function allowedOrigins(): string[] | false {
  const configured = (process.env["CORS_ORIGINS"] ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (configured.length > 0) return configured;
  return isProduction() ? false : DEV_ORIGINS;
}

/** Field names that cause an outbound call to the RAWG API. */
const RAWG_FIELDS = ["searchGamesExternal", "importGame"];

/**
 * Refuses browser requests that came from another site.
 *
 * This matters more than it did. Identity used to arrive in headers the proxy
 * injected, which no third-party page could cause to be sent. It now arrives in
 * a cookie, and browsers attach cookies to requests a foreign page initiates —
 * so this is the CSRF boundary.
 *
 * It is one of three overlapping defences, and they stop different things:
 * SameSite=Lax on the session cookie means it is not attached to a cross-site
 * POST at all; Apollo's csrfPrevention rejects the simple form POSTs that
 * SameSite=None cookies would otherwise permit; and this rejects anything from
 * a browser that names a different origin, so the guarantee does not rest on a
 * default in someone else's library.
 *
 * A request with no Origin header is allowed through: that is curl, the test
 * suite, and the healthcheck, none of which carry ambient credentials.
 */
export function sameOriginOnly(): RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (typeof origin !== "string" || origin === "") return next();

    const allowed = allowedOrigins();
    if (Array.isArray(allowed) && allowed.includes(origin)) return next();

    // Compared on host rather than the full origin so that a misconfigured
    // X-Forwarded-Proto cannot make every same-site request look hostile.
    try {
      if (new URL(origin).host === req.headers.host) return next();
    } catch {
      // Unparseable Origin. Falls through to the refusal below.
    }

    res.status(403).json({
      errors: [{ message: "Cross-origin requests are not allowed." }],
    });
  };
}

/**
 * Where the GraphQL document lives on this request.
 *
 * Apollo serves queries over GET as well as POST, and `express.json()` does not
 * populate `req.body` for a GET — so reading only the body let a caller move the
 * exact same operation to the query string and skip the RAWG bucket entirely,
 * falling back to the general limit of 300/min instead of 30/min. Verified: with
 * the bucket set to 2 and already exhausted by POSTs, 12 GETs of the same
 * operation were all served.
 */
function documents(req: Request): string[] {
  const found: string[] = [];

  const body = req.body as { query?: unknown } | undefined;
  if (typeof body?.query === "string") found.push(body.query);

  const queryParam = (req.query as { query?: unknown } | undefined)?.query;
  if (typeof queryParam === "string") found.push(queryParam);

  return found;
}

function isRawgOperation(req: Request): boolean {
  return documents(req).some((doc) =>
    RAWG_FIELDS.some((field) => doc.includes(field)),
  );
}

function envInt(name: string, fallback: number): number {
  const parsed = parseInt(process.env[name] ?? "", 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export interface Limiters {
  general: RequestHandler;
  rawg: RequestHandler;
  auth: RequestHandler;
  exports: RequestHandler;
  embeds: RequestHandler;
}

/**
 * Built per app instance: express-rate-limit keeps its counters inside the
 * handler, so sharing one across app instances would leak state between them.
 */
export function createLimiters(): Limiters {
  return {
    // Generous enough for normal SPA page loads.
    general: rateLimit({
      windowMs: envInt("RATE_LIMIT_WINDOW_MS", 60_000),
      limit: envInt("RATE_LIMIT_MAX", 300),
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { errors: [{ message: "Too many requests." }] },
    }),
    // Tighter, to keep the RAWG API quota from being burned by a bot.
    rawg: rateLimit({
      windowMs: envInt("RATE_LIMIT_WINDOW_MS", 60_000),
      limit: envInt("RAWG_RATE_LIMIT_MAX", 30),
      standardHeaders: "draft-7",
      legacyHeaders: false,
      skip: (req) => !isRawgOperation(req),
      message: { errors: [{ message: "Too many game searches, slow down." }] },
    }),
    // The /auth routes sit outside the GraphQL limiters and are cheap to abuse:
    // /login makes this app do discovery and issue a redirect, /callback makes
    // it do a token exchange against authentik. Signing in is not something a
    // person does twenty times a minute.
    auth: rateLimit({
      windowMs: envInt("RATE_LIMIT_WINDOW_MS", 60_000),
      limit: envInt("AUTH_RATE_LIMIT_MAX", 20),
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: { errors: [{ message: "Too many sign-in attempts." }] },
    }),
    // An export reads every review one account has, so it is the most expensive
    // thing an authenticated request can ask for. Nobody downloads their own
    // backlog more than a few times in a minute.
    exports: rateLimit({
      windowMs: envInt("RATE_LIMIT_WINDOW_MS", 60_000),
      limit: envInt("EXPORT_RATE_LIMIT_MAX", 10),
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: "Too many exports, try again shortly.\n",
    }),
    // One paste into a busy channel means several unfurls at once, each an
    // anonymous database read. Looser than exports, tighter than the general
    // bucket.
    embeds: rateLimit({
      windowMs: envInt("RATE_LIMIT_WINDOW_MS", 60_000),
      limit: envInt("EMBED_RATE_LIMIT_MAX", 60),
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: "Too many requests.\n",
    }),
  };
}
