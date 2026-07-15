/**
 * The `.cia` URL FBI downloads. Defaults to the GitHub Releases "latest"
 * link, which permanently redirects to the newest published `rom-archive.cia`
 * asset — the QR never changes as new releases ship. Override with
 * `NEXT_PUBLIC_CIA_URL` if hosting the CIA elsewhere.
 */
export const CIA_URL: string =
  process.env.NEXT_PUBLIC_CIA_URL ??
  "https://github.com/CodingButter/rom-archive/releases/latest/download/rom-archive.cia";
