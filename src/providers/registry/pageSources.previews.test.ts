jest.mock('@/providers/integration/deezer', () => ({ searchAlbumPreviews: jest.fn() }));
jest.mock('./musicbrainz', () => ({ currentMusicbrainzClient: jest.fn() }));

import { fetchAlbumPreviews } from './pageSources';
import { searchAlbumPreviews } from '@/providers/integration/deezer';
import type { Album } from '@/domain/entities/Album';
import type { Song } from '@/domain/entities/Song';

const album = { title: 'Album', artist: { name: 'Artist' } } as Album;
const song = (nativeId: string, title: string, discNumber = 1) => ({
  nativeId, title, discNumber, trackNumber: 1, durationSeconds: 180,
  provenance: { origin: 'integration', providerId: 'musicbrainz' }, contentKind: 'song',
}) as Song;

it('matches reordered editions by title, never by a conflicting track position', async () => {
  (searchAlbumPreviews as jest.Mock).mockResolvedValue([
    { title: 'Second', track_position: 1, duration: 180, preview: 'second' },
    { title: 'First', track_position: 2, duration: 180, preview: 'first' },
  ]);
  expect(await fetchAlbumPreviews(album, [song('a', 'First'), song('b', 'Second')])).toEqual({ a: 'first', b: 'second' });
});

it('keeps disc identity and rejects another version with a different duration', async () => {
  (searchAlbumPreviews as jest.Mock).mockResolvedValue([
    { title: 'Intro', disk_number: 1, track_position: 1, duration: 180, preview: 'disc-one' },
    { title: 'Intro', disk_number: 2, track_position: 1, duration: 180, preview: 'disc-two' },
    { title: 'Live', track_position: 2, duration: 240, preview: 'wrong-version' },
  ]);
  expect(await fetchAlbumPreviews(album, [song('a', 'Intro', 2), song('b', 'Live')])).toEqual({ a: 'disc-two' });
});
