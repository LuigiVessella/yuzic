jest.mock('@/providers/integration/deezer', () => ({
  resolveDeezerArtistByName: jest.fn(async () => ({ nativeId: 'seed' })),
  getDeezerRelatedArtists: jest.fn(async () => Array.from({ length: 8 }, (_, index) => ({ nativeId: `related-${index}` }))),
  getDeezerArtistAlbums: jest.fn(async (id: string) => Array.from({ length: 5 }, (_, index) => ({
    nativeId: `${id}-${index}`, artist: { name: id }, cover: { kind: 'url', url: 'https://cover.test' },
  }))),
}));

import { fetchAlbumsLikeArtist } from './homeDiscovery';

it('keeps missing releases by the seed artist eligible and rotates candidates deterministically', async () => {
  const first = await fetchAlbumsLikeArtist('Artist', { relatedLimit: 8, targetAlbums: 3, rotationSeed: 100 });
  const same = await fetchAlbumsLikeArtist('Artist', { relatedLimit: 8, targetAlbums: 3, rotationSeed: 100 });
  const next = await fetchAlbumsLikeArtist('Artist', { relatedLimit: 8, targetAlbums: 3, rotationSeed: 200 });
  expect(first.some(album => album.artist.name === 'seed')).toBe(true);
  expect(same).toEqual(first);
  expect(next).not.toEqual(first);
});
