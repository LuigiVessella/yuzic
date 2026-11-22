import type { SearchResult } from '@/features/search/searchRanking';
import { resultToAlbum, resultToArtist, isExternalArtist } from './searchResultAdapters';

const baseResult: SearchResult = {
  id: 'x-1',
  title: 'Rumours',
  subtext: 'Fleetwood Mac',
  cover: { kind: 'none' },
  type: 'album',
  source: 'local',
  isDownloaded: false,
};

describe('resultToAlbum', () => {
  it('builds a server-provenance album for a local result', () => {
    const album = resultToAlbum(baseResult, 'srv-1');
    expect(album.provenance).toEqual({ origin: 'server', serverId: 'srv-1' });
    expect(album.nativeId).toBe('x-1');
  });

  it('builds an integration-provenance album for an external result, tagged with its own source', () => {
    const external: SearchResult = { ...baseResult, source: 'external', externalSource: 'deezer', id: 'dz-1' };
    const album = resultToAlbum(external, 'srv-1');
    expect(album.provenance).toEqual({ origin: 'integration', providerId: 'deezer' });
  });

  it('keeps a single as a release rather than converting it to a song or album', () => {
    const result: SearchResult = { ...baseResult, source: 'external', externalSource: 'deezer', releaseType: 'single' };
    expect(resultToAlbum(result, 'srv-1').releaseType).toBe('single');
  });

  it('uses the actual MusicBrainz artist when the row subtitle is a year', () => {
    const result: SearchResult = { ...baseResult, source: 'external', externalSource: 'musicbrainz',
      subtext: '1977', artistName: 'Fleetwood Mac' };
    expect(resultToAlbum(result, 'srv-1').artist.name).toBe('Fleetwood Mac');
  });
});

describe('resultToArtist', () => {
  it('marks a local result in-library regardless of activeServerId presence', () => {
    const artist = resultToArtist({ ...baseResult, type: 'artist' }, undefined);
    expect(isExternalArtist(artist)).toBe(false);
  });

  it('marks an external result external, downloaded or not', () => {
    // Downloaded is a search-ranking fact, not a provenance one: having a copy
    // does not make a MusicBrainz artist a library artist.
    const external = { ...baseResult, type: 'artist' as const, source: 'external' as const, externalSource: 'musicbrainz' };

    expect(isExternalArtist(resultToArtist(external, undefined))).toBe(true);
    expect(isExternalArtist(resultToArtist({ ...external, isDownloaded: true }, undefined))).toBe(true);
  });
});
