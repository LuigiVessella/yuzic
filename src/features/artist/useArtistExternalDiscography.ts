import { useEffect, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { selectSourceServerUrls } from '@/features/settings/sources/state';
import { QueryKeys } from '@/state/query/queryKeys';
import { useBrowsableExternalSources } from '@/features/sources/registry';
import { useIsOffline } from '@/features/connectivity/useIsOffline';
import type { Album } from '@/domain/entities/Album';
import type { ExternalIds } from '@/domain/identity/ExternalIds';
import type { SourceId } from '@/features/sources/registry';

type ArtistExternalDiscography = {
  albums: Album[];
  singles: Album[];
};

const PAGE_SIZE = 25;
type Cursor = { source: SourceId; artistId: string; offset: number };

// Built on SourceDefinition.fetchArtistAlbums (Deezer + MusicBrainz both
// implement it) resolved across every enabled source, rather than
// useArtistTopTracks — that hook is hardcoded to Deezer only and would give
// MusicBrainz-only users a silently-incomplete discography.
export function useArtistExternalDiscography(
  artistName: string | null,
  enabled: boolean,
  knownIds?: ExternalIds,
  sourceId?: string,
) {
  const sources = useBrowsableExternalSources();
  const isOffline = useIsOffline();
  const enabledSources = sources.filter(source => !sourceId || source.id === sourceId);
  const sourceIds = enabledSources.map(s => s.id).join(',');
  const serverUrls = useSelector(selectSourceServerUrls);
  const canLoad = enabled && !isOffline && !!artistName && enabledSources.length > 0;

  const query = useInfiniteQuery({
    queryKey: [QueryKeys.LocalArtistExternalDiscography, artistName, sourceIds, knownIds, serverUrls],
    enabled: canLoad,
    staleTime: 1000 * 60 * 60 * 24,
    initialPageParam: null as Cursor[] | null,
    queryFn: async ({ pageParam }) => {
      const resolvedSources = pageParam ? [] : await Promise.allSettled(enabledSources.map(async source => {
        const artistId = knownIds && source.artistIdOf(knownIds);
        const resolved = artistId ? { id: artistId } : await source.resolveArtist(artistName!);
        return resolved ? { source: source.id, artistId: resolved.id, offset: 0 } : null;
      }));
      if (resolvedSources.length && resolvedSources.every(result => result.status === 'rejected')) {
        throw resolvedSources[0].reason;
      }
      const cursors = pageParam ?? resolvedSources.flatMap(result =>
        result.status === 'fulfilled' && result.value ? [result.value] : []
      );
      const settled = await Promise.allSettled(
        cursors.map(async cursor => {
          const source = enabledSources.find(source => source.id === cursor.source)!;
          const albums = await source.fetchArtistAlbums(cursor.artistId, PAGE_SIZE, artistName!, cursor.offset);
          return { albums, next: albums.length === PAGE_SIZE ? { ...cursor, offset: cursor.offset + albums.length } : null };
        })
      );
      if (settled.length && settled.every(result => result.status === 'rejected')) throw settled[0].reason;
      const perSource = settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
      return { albums: perSource.flatMap(page => page.albums), next: perSource.flatMap(page => page.next ? [page.next] : []) };
    },
    getNextPageParam: page => page.next.length ? page.next : undefined,
  });

  // Publish each page before asking for the next; failures keep earlier pages.
  const { fetchNextPage, hasNextPage, isFetching, isError } = query;
  useEffect(() => {
    if (canLoad && hasNextPage && !isFetching && !isError) void fetchNextPage();
  }, [canLoad, fetchNextPage, hasNextPage, isFetching, isError]);
  const data = useMemo<ArtistExternalDiscography | undefined>(() => {
    const all = query.data?.pages.flatMap(page => page.albums);
    return all && {
      albums: all.filter(album => album.releaseType !== 'single' && album.releaseType !== 'ep'),
      singles: all.filter(album => album.releaseType === 'single' || album.releaseType === 'ep'),
    };
  }, [query.data]);
  return { ...query, data };
}
