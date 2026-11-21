import type { Album } from '@/domain/entities/Album';
import { currentMusicbrainzClient } from './musicbrainz';

/** Lidarr identifies albums by release-group, never by an edition's release id. */
export async function acquisitionAlbum(album: Album): Promise<Album> {
  const ids = album.externalIds;
  if (!ids.mbid || ids.mbidType !== 'release') return album;
  const release = await currentMusicbrainzClient().getRelease(ids.mbid);
  const group = release['release-group'];
  if (!group?.id) throw new Error('MusicBrainz release has no release-group');
  return {
    ...album,
    externalIds: { ...ids, mbid: group.id, mbidType: 'release-group' },
  };
}
