import { deezerClient } from './client';
import { mapAlbum } from './mapAlbum';
import { mapArtist } from './mapArtist';
import { mapSong } from './mapSong';
import type { DeezerAlbum, DeezerArtist, DeezerTrack } from './types';
import type { Artist } from '@/domain/entities/Artist';
import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';
import type { AlbumDetail } from '@/domain/entities/Detail';
import type { ArtistRef } from '@/domain/entities/EntityRef';
import { uniqueNameMatch } from '@/domain/identity/catalogueMatch';
import { normalizeName } from '@/domain/identity/matching';
import { integrationProvenance } from '@/domain/identity/Provenance';

const PROVENANCE = integrationProvenance('deezer');

type DeezerListResponse<T> = {
  data?: T[];
};

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const SEARCH_CACHE_MS = 12 * HOUR_MS;
const ARTIST_CACHE_MS = 7 * DAY_MS;
const ARTIST_ALBUMS_CACHE_MS = DAY_MS;
const RELATED_ARTISTS_CACHE_MS = 7 * DAY_MS;
const TRACKS_CACHE_MS = DAY_MS;
const ALBUM_CACHE_MS = DAY_MS;
const GENRE_CACHE_MS = 30 * DAY_MS;
const CHART_CACHE_MS = 6 * HOUR_MS;
const EMPTY_CACHE_MS = HOUR_MS;

// No expiry sweep runs on its own — an expired entry only gets replaced once
// that exact key is requested again — so without a cap this grows without
// bound over a long session of browsing/searching external catalog data.
const CACHE_MAX_ENTRIES = 500;

const memoryCache = new Map<string, { expiresAt: number; value: unknown }>();
const pendingRequests = new Map<string, Promise<unknown>>();
let cacheRevision = 0;

/** A deliberate Home refresh renews discovery data, retaining name/identity lookups. */
export function refreshDeezerDiscovery(): void {
  cacheRevision += 1;
  for (const key of memoryCache.keys()) {
    if (/^(chart-|related-artists:|artist-albums:|genre-artists:)/.test(key)) memoryCache.delete(key);
  }
  pendingRequests.clear();
}

function cacheTtl<T>(value: T, ttlMs: number): number {
  return Array.isArray(value) && value.length === 0 ? EMPTY_CACHE_MS : ttlMs;
}

async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const now = Date.now();
  const revision = cacheRevision;
  const hit = memoryCache.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;

  const pending = signal ? undefined : pendingRequests.get(key);
  if (pending) return pending as Promise<T>;

  const request = loader()
    .then(value => {
      if (revision !== cacheRevision || signal?.aborted) return value;
      if (!memoryCache.has(key) && memoryCache.size >= CACHE_MAX_ENTRIES) {
        memoryCache.delete(memoryCache.keys().next().value!);
      }
      memoryCache.set(key, {
        expiresAt: Date.now() + cacheTtl(value, ttlMs),
        value,
      });
      return value;
    })
    .finally(() => {
      if (!signal && pendingRequests.get(key) === request) pendingRequests.delete(key);
    });

  if (!signal) pendingRequests.set(key, request);
  return request;
}

/**
 * Overrides an album's artist reference with `fallbackArtist` when Deezer's
 * DTO carried no embedded artist of its own — the albums-by-artist endpoint
 * routinely omits it. `mapAlbum` cannot do this itself (it only ever sees the
 * DTO), so this is applied as a post-processing step on its result.
 */
function withFallbackArtist(album: Album, dto: DeezerAlbum, fallbackArtist?: Artist | null): Album {
  if (dto.artist?.id != null || !fallbackArtist) return album;
  const artistRef: ArtistRef = {
    localId: fallbackArtist.localId,
    nativeId: fallbackArtist.nativeId,
    externalIds: fallbackArtist.externalIds,
    name: fallbackArtist.name,
    cover: fallbackArtist.cover,
  };
  return { ...album, artist: artistRef };
}

async function requestList<T>(path: string, signal?: AbortSignal): Promise<T[]> {
  const res = await deezerClient.request<DeezerListResponse<T>>(path, signal);
  return Array.isArray(res.data) ? res.data : [];
}

export async function searchDeezerArtists(query: string, limit = 5, signal?: AbortSignal): Promise<Artist[]> {
  if (!query.trim()) return [];
  return cached(`search-artists:${query.trim().toLowerCase()}:${limit}`, SEARCH_CACHE_MS, async () => {
    const artists = await requestList<DeezerArtist>(`/search/artist?q=${encodeURIComponent(query)}&limit=${limit}`, signal);
    return artists.map(dto => mapArtist(dto, PROVENANCE));
  }, signal);
}

export async function searchDeezerAlbums(query: string, limit = 8, signal?: AbortSignal): Promise<Album[]> {
  if (!query.trim()) return [];
  return cached(`search-albums:${query.trim().toLowerCase()}:${limit}`, SEARCH_CACHE_MS, async () => {
    const albums = await requestList<DeezerAlbum>(`/search/album?q=${encodeURIComponent(query)}&limit=${limit}`, signal);
    return albums.map(dto => mapAlbum(dto, { provenance: PROVENANCE }));
  }, signal);
}

export async function searchDeezerTracks(query: string, limit = 8, signal?: AbortSignal): Promise<Song[]> {
  if (!query.trim()) return [];
  return cached(`search-tracks:${query.trim().toLowerCase()}:${limit}`, SEARCH_CACHE_MS, async () => {
    const tracks = await requestList<DeezerTrack>(`/search/track?q=${encodeURIComponent(query)}&limit=${limit}`, signal);
    return tracks.filter(track => track.id != null && track.album?.id != null)
      .map(track => mapSong(track, { provenance: PROVENANCE, album: track.album! }));
  }, signal);
}

export async function getDeezerTrack(trackId: string): Promise<Song | null> {
  const track = await deezerClient.request<DeezerTrack>(`/track/${encodeURIComponent(trackId)}`);
  return track.id != null && track.album?.id != null
    ? mapSong(track, { provenance: PROVENANCE, album: track.album }) : null;
}

export async function getDeezerArtist(artistId: string): Promise<Artist | null> {
  return cached(`artist:${artistId}`, ARTIST_CACHE_MS, async () => {
    const dto = await deezerClient.request<DeezerArtist>(`/artist/${encodeURIComponent(artistId)}`);
    return dto?.id ? mapArtist(dto, PROVENANCE) : null;
  });
}

export async function getDeezerArtistAlbums(
  artistId: string,
  limit = 50,
  fallbackArtist?: Artist | null,
  offset = 0,
): Promise<Album[]> {
  const fallbackKey = fallbackArtist?.nativeId ?? fallbackArtist?.name ?? '';
  return cached(`artist-albums:${artistId}:${limit}:${fallbackKey}:${offset}`, ARTIST_ALBUMS_CACHE_MS, async () => {
    const albums = await requestList<DeezerAlbum>(`/artist/${encodeURIComponent(artistId)}/albums?limit=${limit}&index=${offset}`);
    return albums.map(dto => withFallbackArtist(mapAlbum(dto, { provenance: PROVENANCE }), dto, fallbackArtist));
  });
}

export async function getDeezerRelatedArtists(artistId: string, limit = 12): Promise<Artist[]> {
  return cached(`related-artists:${artistId}:${limit}`, RELATED_ARTISTS_CACHE_MS, async () => {
    const artists = await requestList<DeezerArtist>(`/artist/${encodeURIComponent(artistId)}/related?limit=${limit}`);
    return artists.map(dto => mapArtist(dto, PROVENANCE));
  });
}

export async function getDeezerArtistTopTracks(artistId: string, limit = 10): Promise<Song[]> {
  return cached(`artist-top-tracks:${artistId}:${limit}`, TRACKS_CACHE_MS, async () => {
    const tracks = await requestList<DeezerTrack>(`/artist/${encodeURIComponent(artistId)}/top?limit=${limit}`);
    return tracks
      .filter(track => track.album)
      .map(track => mapSong(track, { provenance: PROVENANCE, album: track.album! }));
  });
}

export async function getDeezerAlbum(albumId: string): Promise<AlbumDetail | null> {
  return cached(`album:${albumId}`, ALBUM_CACHE_MS, async () => {
    const dto = await deezerClient.request<DeezerAlbum>(`/album/${encodeURIComponent(albumId)}`);
    if (!dto?.id) return null;

    const trackDtos = [...(dto.tracks?.data ?? [])];
    while (trackDtos.length < (dto.nb_tracks ?? trackDtos.length)) {
      const page = await requestList<DeezerTrack>(`/album/${encodeURIComponent(albumId)}/tracks?limit=100&index=${trackDtos.length}`);
      if (!page.length) break;
      trackDtos.push(...page);
    }
    const songs = trackDtos.map(track => mapSong(track, { provenance: PROVENANCE, album: dto }));
    const album = mapAlbum(dto, { provenance: PROVENANCE, songIds: songs.map(s => s.localId) });

    return { album, songs };
  });
}

export async function resolveDeezerArtistByName(name: string): Promise<Artist | null> {
  if (!name.trim()) return null;
  return cached(`resolve-artist:${name.trim().toLowerCase()}`, SEARCH_CACHE_MS, async () => {
    const artists = await searchDeezerArtists(name, 5);
    return uniqueNameMatch(artists, name, artist => artist.name);
  });
}

export async function getDeezerGenreList(): Promise<{ id: number; name: string }[]> {
  return cached('genres', GENRE_CACHE_MS, async () => {
    const res = await deezerClient.request<{ data?: { id: number; name: string }[] }>('/genre');
    return res?.data ?? [];
  });
}

export async function getDeezerArtistsByGenreId(genreId: number, limit = 20): Promise<Artist[]> {
  return cached(`genre-artists:${genreId}:${limit}`, GENRE_CACHE_MS, async () => {
    const artists = await requestList<DeezerArtist>(`/genre/${genreId}/artists?limit=${limit}`);
    return artists.map(dto => mapArtist(dto, PROVENANCE));
  });
}

export async function getDeezerChartArtists(limit = 10): Promise<Artist[]> {
  return cached(`chart-artists:${limit}`, CHART_CACHE_MS, async () => {
    const artists = await requestList<DeezerArtist>(`/chart/0/artists?limit=${limit}`);
    return artists.map(dto => mapArtist(dto, PROVENANCE));
  });
}

export async function getDeezerChartAlbums(limit = 10): Promise<Album[]> {
  return cached(`chart-albums:${limit}`, CHART_CACHE_MS, async () => {
    const albums = await requestList<DeezerAlbum>(`/chart/0/albums?limit=${limit * 2}`);
    const seenArtists = new Set<string>();
    const result: Album[] = [];
    for (const dto of albums) {
      const artistKey = (dto.artist?.name ?? '').toLowerCase();
      if (artistKey && seenArtists.has(artistKey)) continue;
      if (artistKey) seenArtists.add(artistKey);
      result.push(mapAlbum(dto, { provenance: PROVENANCE }));
      if (result.length >= limit) break;
    }
    return result;
  });
}

export async function resolveDeezerAlbum(artist: string, title: string): Promise<Album | null> {
  const key = `${artist.trim().toLowerCase()}:${title.trim().toLowerCase()}`;
  return cached(`resolve-album:${key}`, SEARCH_CACHE_MS, async () => {
    const precise = await searchDeezerAlbums(`artist:"${artist.replace(/["\\]/g, '\\$&')}" album:"${title.replace(/["\\]/g, '\\$&')}"`, 5);
    const candidates = precise.length ? precise : await searchDeezerAlbums(`${artist} ${title}`, 5);
    return uniqueNameMatch(
      candidates.filter(album => normalizeName(album.artist.name) === normalizeName(artist)),
      title,
      album => album.title,
    );
  });
}
