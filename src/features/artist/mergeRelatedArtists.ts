import type { Artist } from '@/domain/entities/Artist'
import { sharedIdentifier } from '@/domain/identity/matching'
import { matchArtistToLibrary } from '@/features/library/matchToLibrary'
import type { SourceId } from '@/providers/registry/sources'

export type RelatedArtist = { artist: Artist; source?: SourceId }

export function mergeRelatedArtists(rows: readonly RelatedArtist[], library: readonly Artist[], seed: Artist): RelatedArtist[] {
  const result: RelatedArtist[] = []
  const sameArtist = (a: Artist, b: Artist) =>
    a.localId === b.localId || !!sharedIdentifier(a.externalIds, b.externalIds)
  for (const row of rows) {
    const artist = row.artist.provenance.origin === 'server'
      ? row.artist
      : matchArtistToLibrary(row.artist, library) ?? row.artist
    if (sameArtist(artist, seed) || result.some(entry => sameArtist(entry.artist, artist))) continue
    result.push({ ...row, artist })
  }
  return result
}
