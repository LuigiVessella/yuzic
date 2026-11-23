import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useArtistExternalDiscography } from './useArtistExternalDiscography';
import type { Album } from '@/domain/entities/Album';

const mockResolve = jest.fn();
const mockCandidates = jest.fn();
const mockFetch = jest.fn();
jest.mock('@/features/sources/registry', () => ({
  useBrowsableExternalSources: () => [{
    id: 'musicbrainz', resolveArtist: mockResolve, resolveArtistCandidates: mockCandidates, fetchArtistAlbums: mockFetch,
    artistIdOf: (ids: { mbid?: string }) => ids.mbid,
  }],
}));
jest.mock('react-redux', () => ({ useSelector: () => ({}) }));
jest.mock('@/features/connectivity/useIsOffline', () => ({ useIsOffline: () => false }));

const album = (index: number) => ({ nativeId: String(index), releaseType: 'album' }) as Album;

it('publishes the first page, then adds releases beyond 25 using the known artist id', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  let finish!: (albums: Album[]) => void;
  mockFetch.mockResolvedValueOnce(Array.from({ length: 25 }, (_, index) => album(index)))
    .mockImplementationOnce(() => new Promise<Album[]>(resolve => { finish = resolve; }));
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result, unmount } = await renderHook(() => useArtistExternalDiscography('Artist', true, { mbid: 'known-artist' }), { wrapper });
  await waitFor(() => expect(result.current.data?.albums).toHaveLength(25));
  await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('known-artist', 25, 'Artist', 25));
  expect(mockResolve).not.toHaveBeenCalled();
  finish([album(25)]);
  await waitFor(() => expect(result.current.data?.albums).toHaveLength(26));
  unmount();
  client.clear();
});

it('uses an owned album to resolve same-name catalogue profiles', async () => {
  mockResolve.mockReset().mockResolvedValue(null);
  mockCandidates.mockReset().mockResolvedValue([
    { id: 'correct', name: 'Fabri Fibra' }, { id: 'other', name: 'Fabri Fibra' },
  ]);
  const release = { nativeId: 'caos', title: 'Caos', artist: { name: 'Fabri Fibra' },
    externalIds: {}, releaseType: 'album' } as Album;
  const owned = { ...release, localId: 'owned-caos' } as Album;
  mockFetch.mockReset().mockImplementation(async (id: string) => id === 'correct' ? [release] : []);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result, unmount } = await renderHook(() => useArtistExternalDiscography('Fabri Fibra', true, {}, undefined, [owned]), { wrapper });
  await waitFor(() => expect(result.current.data?.albums).toHaveLength(1));
  expect(mockFetch).toHaveBeenCalledWith('correct', 25, 'Fabri Fibra', 0);
  unmount();
  client.clear();
});
