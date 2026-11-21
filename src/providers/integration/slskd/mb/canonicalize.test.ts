import { canonicalizeAlbumFromMbid } from './canonicalize';

it('uses the injected metadata server and the correct entity type for an edition', async () => {
  const client = {
    getRelease: jest.fn().mockResolvedValue({ title: 'Original Edition', 'artist-credit': [{ artist: { name: 'Artist' } }] }),
    getReleaseGroup: jest.fn(),
  };
  expect(await canonicalizeAlbumFromMbid('edition', 'release', client)).toEqual({ title: 'Original Edition', artist: 'Artist' });
  expect(client.getRelease).toHaveBeenCalledWith('edition');
  expect(client.getReleaseGroup).not.toHaveBeenCalled();
});
