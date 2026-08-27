import { createServer, type Server } from "node:http";
import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { AddressInfo } from "node:net";

/**
 * A minimal OpenID Provider, in-process.
 *
 * Enough of authentik to run a real authorization code flow: discovery, JWKS, an
 * authorization endpoint that redirects back with a code, and a token endpoint
 * that returns a genuinely RS256-signed ID token. openid-client verifies that
 * signature against the JWKS this serves, so the happy path is exercised rather
 * than mocked — which is the only way the callback's validation gets tested at
 * all.
 *
 * Deliberately no container and no network dependency, so it runs in CI.
 */

const KID = "stub-key-1";

export interface StubClaims {
  sub: string;
  preferred_username?: string;
  email?: string;
  name?: string;
}

export interface StubProvider {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** Set the claims the next ID token will carry. */
  setClaims: (claims: StubClaims) => void;
  /** Overrides the `nonce` put in the next ID token, to test the mismatch path. */
  forceNonce: (nonce: string | null) => void;
  /** Every authorization request this provider received. */
  authorizeRequests: URL[];
  tokenRequestCount: () => number;
  close: () => Promise<void>;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function signJwt(payload: Record<string, unknown>, privateKey: KeyObject): string {
  const header = { alg: "RS256", typ: "JWT", kid: KID };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload)
  )}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  return `${signingInput}.${signer.sign(privateKey).toString("base64url")}`;
}

export async function startStubProvider(
  redirectUri: string
): Promise<StubProvider> {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" });

  const clientId = "gamereviews-test-client";
  const clientSecret = "test-client-secret";

  let claims: StubClaims = {
    sub: "stub-sub-0001",
    preferred_username: "simon",
    email: "simon@example.com",
  };
  let forcedNonce: string | null = null;
  let tokenRequests = 0;
  const authorizeRequests: URL[] = [];

  // Maps the authorization code to the nonce that was requested with it, which
  // is what makes the ID token's nonce genuinely round-trip.
  const codes = new Map<string, { nonce: string | null }>();

  let issuer = "";

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", issuer);

    if (url.pathname === "/.well-known/openid-configuration") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
          end_session_endpoint: `${issuer}/end-session`,
          response_types_supported: ["code"],
          subject_types_supported: ["public"],
          id_token_signing_alg_values_supported: ["RS256"],
          scopes_supported: ["openid", "profile", "email"],
          token_endpoint_auth_methods_supported: ["client_secret_basic"],
          code_challenge_methods_supported: ["S256"],
        })
      );
      return;
    }

    if (url.pathname === "/jwks") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: "RS256", use: "sig" }] }));
      return;
    }

    if (url.pathname === "/authorize") {
      authorizeRequests.push(url);
      const code = `code-${authorizeRequests.length}`;
      codes.set(code, { nonce: url.searchParams.get("nonce") });

      const back = new URL(url.searchParams.get("redirect_uri") ?? redirectUri);
      back.searchParams.set("code", code);
      const state = url.searchParams.get("state");
      if (state) back.searchParams.set("state", state);

      res.writeHead(302, { location: back.toString() });
      res.end();
      return;
    }

    if (url.pathname === "/token") {
      tokenRequests += 1;
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        const params = new URLSearchParams(body);
        const record = codes.get(params.get("code") ?? "");
        const now = Math.floor(Date.now() / 1000);

        const idToken = signJwt(
          {
            iss: issuer,
            aud: clientId,
            sub: claims.sub,
            iat: now,
            exp: now + 300,
            nonce: forcedNonce ?? record?.nonce ?? undefined,
            ...(claims.preferred_username
              ? { preferred_username: claims.preferred_username }
              : {}),
            ...(claims.email ? { email: claims.email } : {}),
            ...(claims.name ? { name: claims.name } : {}),
          },
          privateKey
        );

        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            access_token: "stub-access-token",
            token_type: "Bearer",
            expires_in: 300,
            id_token: idToken,
          })
        );
      });
      return;
    }

    res.writeHead(404).end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  issuer = `http://127.0.0.1:${port}`;

  return {
    issuer,
    clientId,
    clientSecret,
    setClaims: (next) => {
      claims = next;
    },
    forceNonce: (next) => {
      forcedNonce = next;
    },
    authorizeRequests,
    tokenRequestCount: () => tokenRequests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
