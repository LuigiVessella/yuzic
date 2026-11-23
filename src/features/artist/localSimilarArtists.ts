import type { Album } from '@/domain/entities/Album';
import type { LocalId } from '@/domain/identity/LocalId';
import type { CoverSource } from '@/domain/entities/Cover';

type LocalArtistSummary = {
  /** On-device identity — used for React keys and dedup against other shelves. */
  localId: LocalId;
  /** The artist's id at the origin — used to navigate to the artist screen. */
  nativeId: string;
  name: string;
  cover: CoverSource;
};

// Related library artists ranked by the genre tags they share.
export function findArtistsWithSharedGenres(
  targetArtistLocalId: LocalId,
  albums: Album[],
  limit = 8
): LocalArtistSummary[] {
  const genresByArtist = new Map<LocalId, Set<string>>();
  const artistMeta = new Map<LocalId, LocalArtistSummary>();

  for (const album of albums) {
    for (const artist of album.albumArtists ?? [album.artist]) {
      if (!artist.nativeId) continue;
      const { localId, nativeId, name, cover } = artist;
      if (!artistMeta.has(localId)) artistMeta.set(localId, { localId, nativeId, name, cover });
      const genres = genresByArtist.get(localId) ?? new Set<string>();
      album.genres.forEach(genre => genres.add(genre));
      genresByArtist.set(localId, genres);
    }
  }

  const targetGenres = genresByArtist.get(targetArtistLocalId);
  if (!targetGenres || targetGenres.size === 0) return [];

  return [...artistMeta.keys()]
    .filter(localId => localId !== targetArtistLocalId)
    .map(localId => {
      const genres = genresByArtist.get(localId) ?? new Set<string>();
      let overlap = 0;
      for (const g of genres) if (targetGenres.has(g)) overlap++;
      return { localId, overlap };
    })
    .filter(candidate => candidate.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, limit)
    .map(candidate => artistMeta.get(candidate.localId)!);
}
