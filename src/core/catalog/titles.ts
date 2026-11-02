/**
 * kino.watch sends a title as "Russian / Original" in one string (research 10-kp-api §6.1).
 * Returns the local title and, when there is one, the original title shown as a subtitle (spec §9).
 */
export function splitTitle(title: string): { title: string; original: string | null } {
  const at = title.indexOf(' / ');
  if (at < 0) return { title: title.trim(), original: null };
  return { title: title.slice(0, at).trim(), original: title.slice(at + 3).trim() || null };
}
