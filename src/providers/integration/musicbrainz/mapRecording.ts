import type { Song } from '@/domain/entities/Song';
import type { MbRecording, MbReleaseGroup } from './index';
import { integrationProvenance } from '@/domain/identity/Provenance';
import { mapSong } from './mapSong';

const provenance = integrationProvenance('musicbrainz');

/** A recording may appear on many releases. Only attach an album when its
 * release-group is unambiguous; a track Get needs no album association. */
export function mapRecording(recording: MbRecording): Song {
  const groups = new Map<string, MbReleaseGroup>();
  for (const release of recording.releases ?? []) {
    const group = release['release-group'];
    if (group?.id) groups.set(group.id, group);
  }
  const releaseGroup = groups.size === 1 ? [...groups.values()][0] : { id: '', title: '' };
  const song = mapSong({
    id: recording.id,
    title: recording.title,
    length: recording.length ?? null,
    position: 0,
    recording: { id: recording.id },
    'artist-credit': recording['artist-credit'],
  }, { provenance, releaseGroup });
  return groups.size === 1 ? song : { ...song, album: { ...song.album, title: '' } };
}
