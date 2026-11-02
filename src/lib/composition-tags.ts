// Pure helpers for composition tags. No DB access, so the library page and the
// MCP tools can share them and they can be tested without mocks.

/** Comparison key for a tag: tags are unique per composition ignoring case. */
export function tagKey(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * Trim tags, drop empty and non-string values, and remove case-insensitive
 * duplicates. The first spelling wins, so the case the user typed is kept.
 */
export function normalizeTags(tags: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    const tag = raw.trim();
    if (!tag) continue;
    const key = tagKey(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}
