import { mapRecording } from './mapRecording';

describe('mapRecording', () => {
  it('keeps the recording identity without choosing an arbitrary release', () => {
    const song = mapRecording({
      id: 'rec-1', title: 'Lontano',
      'artist-credit': [{ artist: { id: 'artist-1', name: 'Sfera Ebbasta' } }],
      releases: [
        { 'release-group': { id: 'album-1', title: 'First' } },
        { 'release-group': { id: 'album-2', title: 'Second' } },
      ],
    });
    expect(song.nativeId).toBe('rec-1');
    expect(song.externalIds).toEqual({ mbid: 'rec-1' });
    expect(song.artist.name).toBe('Sfera Ebbasta');
    expect(song.album.nativeId).toBe('');
    expect(song.album.title).toBe('');
  });
});
