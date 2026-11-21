import { getDeezerAlbum, getDeezerArtistAlbums, resolveDeezerArtistByName, refreshDeezerDiscovery } from './catalog';
import { integrationProvenance } from '@/domain/identity/Provenance';
import { makeLocalId } from '@/domain/identity/LocalId';
import type { Artist } from '@/domain/entities/Artist';

function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as unknown as Response);
}

describe('getDeezerArtistAlbums', () => {
  it('uses an offset for later pages and a deliberate refresh expires discovery entries', async () => {
    global.fetch = jest.fn(async () => jsonResponse({ data: [{ id: 555, title: 'Page Two' }] })) as unknown as typeof fetch;
    await getDeezerArtistAlbums('paged-artist', 25, null, 25);
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain('limit=25&index=25');
    await getDeezerArtistAlbums('paged-artist', 25, null, 25);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    refreshDeezerDiscovery();
    await getDeezerArtistAlbums('paged-artist', 25, null, 25);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not silently select between same-named artists', async () => {
    global.fetch = jest.fn(async () => jsonResponse({ data: [{ id: 1, name: 'Ambiguous Artist' }, { id: 2, name: 'Ambiguous Artist' }] })) as unknown as typeof fetch;
    expect(await resolveDeezerArtistByName('Ambiguous Artist')).toBeNull();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('falls back to the caller-supplied artist when the album DTO has no embedded artist', async () => {
    // Deezer's /artist/:id/albums endpoint routinely omits the embedded
    // artist object, unlike search/album/top-tracks responses. mapAlbum alone
    // would then resolve an "Unknown Artist" ref — the fallback below is what
    // fills it in.
    global.fetch = jest.fn(async () =>
      jsonResponse({ data: [{ id: 501, title: 'No Embedded Artist' }] })
    ) as unknown as typeof fetch;

    const provenance = integrationProvenance('deezer');
    const fallbackArtist: Artist = {
      localId: makeLocalId('artist', provenance, '42'),
      nativeId: '42',
      provenance,
      externalIds: { deezerId: '42' },
      name: 'Fallback Artist',
      cover: { kind: 'none' },
      tags: [],
      albumIds: [],
    };

    const [album] = await getDeezerArtistAlbums('42-unique-1', 10, fallbackArtist);

    expect(album.artist.name).toBe('Fallback Artist');
    expect(album.artist.localId).toBe(fallbackArtist.localId);
  });

  it('keeps the DTO-embedded artist when one is present, ignoring the fallback', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({
        data: [{ id: 502, title: 'Has Embedded Artist', artist: { id: 99, name: 'Real Artist' } }],
      })
    ) as unknown as typeof fetch;

    const provenance = integrationProvenance('deezer');
    const fallbackArtist: Artist = {
      localId: makeLocalId('artist', provenance, '42'),
      nativeId: '42',
      provenance,
      externalIds: {},
      name: 'Fallback Artist',
      cover: { kind: 'none' },
      tags: [],
      albumIds: [],
    };

    const [album] = await getDeezerArtistAlbums('42-unique-2', 10, fallbackArtist);

    expect(album.artist.name).toBe('Real Artist');
  });
});

describe('getDeezerAlbum', () => {
  it('loads tracks beyond the embedded first page', async () => {
    global.fetch = jest.fn(async (url: string) => jsonResponse(url.includes('/tracks?')
      ? { data: [{ id: 9002, title: 'Disc Two', disk_number: 2, track_position: 1 }] }
      : { id: 9000, title: 'Box Set', artist: { id: 1, name: 'Artist' }, nb_tracks: 2,
        tracks: { data: [{ id: 9001, title: 'Disc One', disk_number: 1, track_position: 1 }] } }
    )) as unknown as typeof fetch;
    const detail = await getDeezerAlbum('multi-disc-test');
    expect(detail?.songs).toHaveLength(2);
    expect(detail?.songs[1]).toMatchObject({ discNumber: 2, trackNumber: 1 });
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('bundles the mapped album with its mapped tracks as an AlbumDetail', async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({
        id: 7001,
        title: 'Full Album',
        artist: { id: 1, name: 'Artist' },
        tracks: { data: [{ id: 7101, title: 'Track One', artist: { id: 1, name: 'Artist' }, duration: 200 }] },
      })
    ) as unknown as typeof fetch;

    const detail = await getDeezerAlbum('7001-unique');

    expect(detail?.album.title).toBe('Full Album');
    expect(detail?.songs).toHaveLength(1);
    expect(detail?.songs[0].title).toBe('Track One');
    expect(detail?.album.songIds).toEqual([detail?.songs[0].localId]);
  });

  it('returns null when the album has no id', async () => {
    global.fetch = jest.fn(async () => jsonResponse({})) as unknown as typeof fetch;

    const detail = await getDeezerAlbum('missing-unique');

    expect(detail).toBeNull();
  });
});
