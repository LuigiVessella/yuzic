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
import { planSearchLegs, type SearchResultScope } from '@/features/search/searchLegs';
import {
  searchLibraryLeg,
  searchServerLeg,
  searchPlaylistIndexLeg,
  searchExternalLeg,
  ALL_SEARCH_ENTITY_TYPES,
  type SearchEntityType,
  type SearchIndex,
  type DownloadedIds,
} from '@/features/search/searchPolicy';

export type { SearchResult } from '@/features/search/searchRanking';
export type { SearchEntityType } from '@/features/search/searchPolicy';

type SearchFilters = {
  /** `all` combines library and enabled external source sections. */
  resultScope: SearchResultScope;
  /** Source ids to query in `all` or `other` — the sources the
   *  Filters sheet left checked, already narrowed to ones enabled for
   *  search. Ignored when `resultScope` is 'library'. */
  sourceIds: string[];
  /** Which entity types to ask each external source for. Defaults to all
   *  supported types when omitted. Ignored when `resultScope` is 'library'. */
  entityTypes?: SearchEntityType[];
};

interface SearchContextType {
  searchResults: SearchResult[];
  clearSearch: () => void;
  isLoading: boolean;
  /** True when the most recent search failed to reach the server/external source, so results shown (if any) may be incomplete. */
  hasError: boolean;
  /**
   * True when the remote legs of the search were deliberately skipped because
   * the server can't be reached, so what's shown is the local library only.
   * Distinct from `hasError`: nothing failed, it was never attempted.
   */
  degraded: boolean;
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

  const searchRequestIdRef = useRef(0);
  const externalAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => externalAbortRef.current?.abort(), []);

  // Pre-compute lowercased strings once when library data changes, not on every keystroke.
  // With 9000 tracks this avoids 18,000 toLowerCase() calls per search query.
  const searchIndex: SearchIndex = useMemo(() => ({
    tracks: tracks.map(t => ({ item: t, lc: `${t.title.toLowerCase()} ${t.artist.name.toLowerCase()}` })),
    albums: albums.map(a => ({ item: a, lc: a.title.toLowerCase() })),
    artists: artists.map(a => ({ item: a, lc: a.name.toLowerCase() })),
    playlists: playlists.map(p => ({ item: p, lc: p.title.toLowerCase() })),
  }), [tracks, albums, artists, playlists]);

  const clearSearch = useCallback(() => {
    externalAbortRef.current?.abort();
    searchRequestIdRef.current += 1;
    setSearchResults([]);
    setIsLoading(false);
    setHasError(false);
    setDegraded(false);
  }, []);

  const handleSearchWithFilters = useCallback(async (query: string, filters: SearchFilters) => {
    externalAbortRef.current?.abort();
    const controller = new AbortController();
    externalAbortRef.current = controller;
    const requestId = ++searchRequestIdRef.current;
    if (!query.trim()) {
      setSearchResults([]);
      setIsLoading(false);
      setHasError(false);
      setDegraded(false);
      return;
    }
    setIsLoading(true);
    let errored = false;
    try {
      const lowerQuery = query.toLowerCase();
      const results: SearchResult[] = [];
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

      const publish = () => {
        if (requestId === searchRequestIdRef.current) setSearchResults(dedupeAndSort(results, lowerQuery));
      };
      if (legs.client) {
        results.push(...searchLibraryLeg(searchIndex, query, downloaded));
        publish();
      }
      if (requestId !== searchRequestIdRef.current) return;

      const pending: Promise<void>[] = [];
      if (legs.server) {
        pending.push((async () => {
          try { results.push(...await searchServerLeg(api?.search, query, downloaded)); } catch { errored = true; }
        // The server leg cannot answer for playlists — no `SearchApi` returns
        // them, and Subsonic's search3 has no playlist in its response — but
        // they are synced whole, so the index has every one. Without this a
        // server-scoped search found none, while the on-device scope did.
          results.push(...searchPlaylistIndexLeg(searchIndex, query, downloaded));
          publish();
        })());
      }

      if (legs.externalSources.length > 0) {
        pending.push((async () => {
          try {
            await searchExternalLeg(legs.externalSources, query, entityTypes, controller.signal, sourceResults => {
              results.push(...sourceResults);
              publish();
            });
          } catch { errored = true; }
          publish();
        })());
      }
      await Promise.all(pending);
      if (requestId !== searchRequestIdRef.current) return;

      publish();
      setHasError(errored);
      setDegraded(legs.degraded);
    } finally {
      if (requestId === searchRequestIdRef.current) setIsLoading(false);
    }
  }, [api, canReachExternal, canReachServer, downloaded, searchIndex, searchScope]);

  const value = useMemo<SearchContextType>(() => ({
    searchResults,
    clearSearch,
    isLoading,
    hasError,
    degraded,
    handleSearchWithFilters,
  }), [searchResults, clearSearch, isLoading, hasError, degraded, handleSearchWithFilters]);

  return (
    <SearchContext.Provider value={value}>
      {children}
    </SearchContext.Provider>
  );
};
