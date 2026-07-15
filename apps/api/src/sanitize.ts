import { consoleToRomsDir, type Console } from "@rom-archive/contract";

/**
 * Characters illegal in FAT32 filenames (plus control chars are stripped
 * separately). Mirrored exactly by the C++ core's router.cpp — keep the two in
 * sync (both are host-tested).
 */
const FAT_ILLEGAL = /["*/:<>?\\|]/g;
const MAX_FAT_NAME = 128;

/**
 * Turn an arbitrary archive.org filename into a FAT32-safe name: replace illegal
 * characters and control chars with `_`, collapse the result, trim trailing dots
 * and spaces (illegal as the final char on FAT/Windows), and cap the length.
 * Does NOT disambiguate collisions — that is the caller's job (see
 * sanitizeForPlan) because it needs the full set of names.
 */
export function sanitizeFatName(name: string): string {
  let out = "";
  for (const ch of name) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 ? "_" : ch;
  }
  out = out.replace(FAT_ILLEGAL, "_");
  out = out.replace(/[. ]+$/g, "");
  if (out.length > MAX_FAT_NAME) {
    // preserve the extension when truncating
    const dot = out.lastIndexOf(".");
    if (dot > 0 && out.length - dot <= 8) {
      const ext = out.slice(dot);
      out = out.slice(0, MAX_FAT_NAME - ext.length) + ext;
    } else {
      out = out.slice(0, MAX_FAT_NAME);
    }
  }
  return out.length === 0 ? "_" : out;
}

/**
 * Sanitize a batch of names for one plan, disambiguating collisions: if two
 * inputs sanitize to the same name, later ones get a `~1`, `~2`, … suffix
 * inserted before the extension. Returns names in input order.
 */
export function sanitizeForPlan(names: string[]): string[] {
  const used = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const base = sanitizeFatName(name);
    let candidate = base;
    let n = 1;
    while (used.has(candidate.toLowerCase())) {
      const dot = base.lastIndexOf(".");
      candidate =
        dot > 0
          ? `${base.slice(0, dot)}~${n}${base.slice(dot)}`
          : `${base}~${n}`;
      n += 1;
    }
    used.add(candidate.toLowerCase());
    result.push(candidate);
  }
  return result;
}

/** The SD target path for a sanitized file name on a given console. */
export function targetPathFor(console: Console, sanitizedName: string): string {
  return `${consoleToRomsDir(console)}/${sanitizedName}`;
}
