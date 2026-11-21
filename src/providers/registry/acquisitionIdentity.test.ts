jest.mock('./musicbrainz', () => ({ currentMusicbrainzClient: jest.fn() }));

import { acquisitionAlbum } from './acquisitionIdentity';
import { currentMusicbrainzClient } from './musicbrainz';
import type { Album } from '@/domain/entities/Album';

it('converts an edition to its release-group for Lidarr without changing the browsed entity', async () => {
  const getRelease = jest.fn().mockResolvedValue({ 'release-group': { id: 'group' } });
  (currentMusicbrainzClient as jest.Mock).mockReturnValue({ getRelease });
  const album = { externalIds: { mbid: 'edition', mbidType: 'release' }, title: 'Album' } as Album;
  const request = await acquisitionAlbum(album);
  expect(getRelease).toHaveBeenCalledWith('edition');
  expect(request.externalIds).toEqual({ mbid: 'group', mbidType: 'release-group' });
  expect(album.externalIds.mbid).toBe('edition');
});

it('keeps a known release-group without a network lookup', async () => {
  const album = { externalIds: { mbid: 'group', mbidType: 'release-group' } } as Album;
  (currentMusicbrainzClient as jest.Mock).mockClear();
  expect(await acquisitionAlbum(album)).toBe(album);
  expect(currentMusicbrainzClient).not.toHaveBeenCalled();
});

it('refuses an edition whose group cannot be identified', async () => {
  (currentMusicbrainzClient as jest.Mock).mockReturnValue({ getRelease: async () => ({}) });
  await expect(acquisitionAlbum({ externalIds: { mbid: 'edition', mbidType: 'release' } } as Album)).rejects.toThrow('no release-group');
});
