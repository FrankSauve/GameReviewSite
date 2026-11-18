interface DownloadImageLinkProps {
  /** Served by the backend, not the SPA: a plain link, never a router Link. */
  href: string;
}

/** The file name comes from the server's Content-Disposition. */
export function DownloadImageLink({ href }: DownloadImageLinkProps) {
  return (
    <a href={href} download className="btn-secondary text-meta">
      Download image
    </a>
  );
}
