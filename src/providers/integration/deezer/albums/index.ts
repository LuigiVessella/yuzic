import { deezerClient } from '../client';
import { resolveDeezerAlbum } from '../catalog';
import type { DeezerPreviewTrack } from '../types';

// Re-exported: mapSong.ts and existing consumers import this type from
// wherever `searchAlbumPreviews` (below) is declared. The type itself lives
// in `../types` to avoid an import cycle (catalog -> mapSong -> here ->
// catalog) — see that module's doc comment.
export type { DeezerPreviewTrack } from '../types';

type DeezerTracksResponse = {
  data: DeezerPreviewTrack[];
  next?: string;
};

/**
 * Searches Deezer for an album by artist + title, then fetches its tracks
 * with 30s preview URLs. Returns an empty array if nothing is found.
 *
 * Strategy:
 * 1. Advanced search: artist:"X" album:"Y"  — most precise
 * 2. Fallback: plain "artist album" query    — handles punctuation/formatting differences
 */
export async function searchAlbumPreviews(
  artist: string,
  albumTitle: string
): Promise<DeezerPreviewTrack[]> {
  const resolved = await resolveDeezerAlbum(artist, albumTitle);
  const album = resolved
    ? { id: Number(resolved.nativeId), title: resolved.title, artist: { name: resolved.artist.name } }
    : null;

  if (!album) return [];

  const tracksRes = await deezerClient.request<DeezerTracksResponse>(
    `/album/${album.id}/tracks`
  );

  const tracks = [...(tracksRes.data ?? [])];
  let next = tracksRes.next;
  while (next) {
    const page = await deezerClient.request<DeezerTracksResponse>(`/album/${album.id}/tracks?limit=100&index=${tracks.length}`);
    if (!page.data?.length) break;
    tracks.push(...page.data);
    next = page.next;
  }
  return tracks.filter(track => !!track.preview);
}
