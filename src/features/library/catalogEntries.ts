import { leadArtistName, normalizeName } from '@/domain/identity/matching';

/** Catalog IDs are scoped to the active server. Preserve its order. */
export function uniqueCatalogEntries<T extends { nativeId: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const unique = items.filter(item => {
    if (!item.nativeId) return true;
    if (seen.has(item.nativeId)) return false;
    seen.add(item.nativeId);
    return true;
  });
  return unique.length === items.length ? items : unique;
}

export function withoutCollaborationCredits<T extends { name: string }>(artists: T[]): T[] {
  const counts = new Map<string, number>();
  for (const artist of artists) {
    const name = normalizeName(artist.name);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return artists.filter(artist => {
    const name = normalizeName(artist.name);
    const lead = leadArtistName(name);
    if (lead !== name) return counts.get(lead) !== 1;
    const parts = name.split(';');
    return parts.length === 1 || !parts.every(part => part.trim() && counts.get(part.trim()) === 1);
  });
}
