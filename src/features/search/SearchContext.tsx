import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  ReactNode,
  useRef,
  useEffect,
} from 'react';

import { useAlbums } from '@/features/album/useAlbums';
import { useArtists } from '@/features/artist/useArtists';
import { usePlaylists } from '@/features/playlist/usePlaylists';
import { useIsOffline } from '@/features/connectivity/useIsOffline';
import { useServerUnreachable } from '@/features/connectivity/serverReachability';

import { useTracks } from '@/features/song/useTracks';
import { useApi } from '@/providers/registry/useApi';
import { useSelector } from 'react-redux';
import { selectSearchScope } from '@/features/settings/search/state';
import { useDownload } from '@/features/offline/DownloadContext';
import {
  buildDownloadedTrackIdSet,
  getFullyDownloadedAlbumIds,
} from '@/features/offline/collectionState';

import { dedupeAndSort, type SearchResult } from '@/features/search/searchRanking';
import { planSearchLegs, type SearchFilters } from '@/features/search/searchLegs';
import {
  searchLibraryLeg,
  searchServerLeg,
  searchPlaylistIndexLeg,
  ALL_SEARCH_ENTITY_TYPES,
  type SearchIndex,
  type DownloadedIds,
} from '@/features/search/searchPolicy';
import { useExternalSearch } from './useExternalSearch';

export type { SearchResult } from '@/features/search/searchRanking';
export type { SearchEntityType } from '@/features/search/searchPolicy';

interface SearchContextType {
  searchResults: SearchResult[];
  clearSearch: () => void;
  isLoading: boolean;
  /** Whether the music server search failed. External failures are per source. */
  hasError: boolean;
  /**
   * True when the remote legs of the search were deliberately skipped because
   * the server can't be reached, so what's shown is the local library only.
   * Distinct from `hasError`: nothing failed, it was never attempted.
   */
  degraded: boolean;
  sourceStatuses: Readonly<ReturnType<typeof useExternalSearch>['sourceStatuses']>;
  retrySource: (sourceId: string) => void;
  handleSearchWithFilters: (query: string, filters: SearchFilters) => Promise<void>;
}

interface SearchProviderProps {
  children: ReactNode;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

export const useSearch = () => {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
};

export const SearchProvider: React.FC<SearchProviderProps> = ({ children }) => {
  const api = useApi();
  const { albums } = useAlbums();
  const { artists } = useArtists();
  const { playlists } = usePlaylists();
  const { tracks } = useTracks();

  const searchScope = useSelector(selectSearchScope);

  // Whether the remote halves of a search can be attempted at all. Offline is
  // the device having no network; serverUnreachable is the device being online
  // while the music server isn't (VPN down, server rebooting) — the case that
  // otherwise leaves every keystroke hanging until its own timeout.
  const isOffline = useIsOffline();
  const serverUnreachable = useServerUnreachable();
  const canReachServer = !isOffline && !serverUnreachable;
  // External sources are public APIs, so they only need the device to be
  // online — an unreachable *music server* says nothing about whether they're up.
  const canReachExternal = !isOffline;

  const { downloadedTracks, getAllDownloadedCollections } = useDownload();

  const downloadedTrackIds = useMemo(
    () => buildDownloadedTrackIdSet(
      downloadedTracks
        .map(track => ({ id: String(track.trackId ?? track.originalTrack?.id ?? '') }))
        .filter(track => track.id)
    ),
    [downloadedTracks]
  );

  const downloadedAlbumIds = useMemo(
    () => getFullyDownloadedAlbumIds(
      // Tracks by `localId`, the id downloads are filed under — the two sides
      // have to agree, or every album reads as never fully downloaded. Albums
      // by `nativeId`, which is what search results carry.
      tracks.map(track => ({ id: track.localId, albumId: track.album.nativeId })),
      downloadedTrackIds
    ),
    [tracks, downloadedTrackIds]
  );

  const downloadedPlaylistIds = useMemo(
    () => new Set(
      getAllDownloadedCollections()
        .filter(collection => collection.type === 'playlist')
        .map(collection => String(collection.id))
    ),
    [getAllDownloadedCollections]
  );

  const downloaded: DownloadedIds = useMemo(() => ({
    tracks: downloadedTrackIds,
    albums: downloadedAlbumIds,
    playlists: downloadedPlaylistIds,
  }), [downloadedTrackIds, downloadedAlbumIds, downloadedPlaylistIds]);

  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const { sourceStatuses, startExternal, clearExternal, retrySource } = useExternalSearch(canReachExternal, setSearchResults);

  const searchRequestIdRef = useRef(0);
  useEffect(() => () => {
    searchRequestIdRef.current += 1;
  }, []);

  // Pre-compute lowercased strings once when library data changes, not on every keystroke.
  // With 9000 tracks this avoids 18,000 toLowerCase() calls per search query.
  const searchIndex: SearchIndex = useMemo(() => ({
    tracks: tracks.map(t => ({ item: t, lc: `${t.title.toLowerCase()} ${t.artist.name.toLowerCase()}` })),
    albums: albums.map(a => ({ item: a, lc: a.title.toLowerCase() })),
    artists: artists.map(a => ({ item: a, lc: a.name.toLowerCase() })),
    playlists: playlists.map(p => ({ item: p, lc: p.title.toLowerCase() })),
  }), [tracks, albums, artists, playlists]);

  const clearSearch = useCallback(() => {
    clearExternal();
    searchRequestIdRef.current += 1;
    setSearchResults([]);
    setIsLoading(false);
    setHasError(false);
    setDegraded(false);
  }, [clearExternal]);

  const handleSearchWithFilters = useCallback(async (query: string, filters: SearchFilters) => {
    clearSearch();
    const requestId = ++searchRequestIdRef.current;
    if (!query.trim()) return;
    setIsLoading(true);
    let errored = false;
    try {
      const lowerQuery = query.toLowerCase();
      const entityTypes = filters.entityTypes ?? ALL_SEARCH_ENTITY_TYPES;

      // Decide the legs up front rather than at each call site. A leg that
      // cannot land is not attempted at all: each one would otherwise hang to
      // its own timeout on every keystroke and then land in the same `catch`
      // as a real failure, so local results that succeeded were shown
      // underneath an error banner. `all` plans both families; narrower
      // filters plan one.
      const legs = planSearchLegs({
        resultScope: filters.resultScope,
        enabledExternalSourceIds: filters.sourceIds,
        searchScope,
        serverReachable: canReachServer,
        deviceOnline: canReachExternal,
      });

      const publish = (results: SearchResult[]) => {
        if (requestId === searchRequestIdRef.current) {
          setSearchResults(previous => dedupeAndSort([...previous, ...results], lowerQuery));
        }
      };
      if (legs.client) {
        publish(searchLibraryLeg(searchIndex, query, downloaded));
      }
      if (requestId !== searchRequestIdRef.current) return;

      const pending: Promise<void>[] = [];
      if (legs.server) {
        pending.push((async () => {
          try { publish(await searchServerLeg(api?.search, query, downloaded)); } catch { errored = true; }
        // The server leg cannot answer for playlists — no `SearchApi` returns
        // them, and Subsonic's search3 has no playlist in its response — but
        // they are synced whole, so the index has every one. Without this a
        // server-scoped search found none, while the on-device scope did.
          publish(searchPlaylistIndexLeg(searchIndex, query, downloaded));
        })());
      }

      if (legs.externalSources.length > 0) {
        pending.push(startExternal(query, entityTypes, legs.externalSources));
      }
      await Promise.all(pending);
      if (requestId !== searchRequestIdRef.current) return;

      setHasError(errored);
      setDegraded(legs.degraded);
    } finally {
      if (requestId === searchRequestIdRef.current) setIsLoading(false);
    }
  }, [api, canReachExternal, canReachServer, clearSearch, downloaded, searchIndex, searchScope, startExternal]);

  const value = useMemo<SearchContextType>(() => ({
    searchResults,
    clearSearch,
    isLoading,
    hasError,
    degraded,
    sourceStatuses,
    retrySource,
    handleSearchWithFilters,
  }), [searchResults, clearSearch, isLoading, hasError, degraded, sourceStatuses, retrySource, handleSearchWithFilters]);

  return (
    <SearchContext.Provider value={value}>
      {children}
    </SearchContext.Provider>
  );
};
