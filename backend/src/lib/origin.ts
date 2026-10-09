/** Public origin for a link back to the site. Derived from the forwarded
 *  headers SWAG sets; PUBLIC_ORIGIN pins it where they are absent or not trusted. */
export function publicOrigin(req: {
  protocol: string;
  headers: { host?: string | undefined };
}): string {
  const configured = process.env["PUBLIC_ORIGIN"];
  if (configured) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.headers.host ?? "localhost"}`;
}
