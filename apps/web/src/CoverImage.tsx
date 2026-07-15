import { useState } from "react";

/**
 * A libretro box-art thumbnail with a graceful fallback. The derived URL is
 * unverified (libretro 404s for titles it lacks), so on error we collapse to a
 * placeholder tile instead of a broken-image icon.
 */
export function CoverImage({
  url,
  alt,
}: {
  url: string | null;
  alt: string;
}): React.JSX.Element {
  const [failed, setFailed] = useState(false);

  if (url === null || failed) {
    return (
      <div className="cover cover-missing" role="img" aria-label={`${alt} (no cover art)`}>
        <span aria-hidden="true">🎮</span>
      </div>
    );
  }

  return (
    <img
      className="cover"
      src={url}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
