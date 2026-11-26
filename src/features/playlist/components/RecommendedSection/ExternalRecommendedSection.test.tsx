import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { Album } from '@/domain/entities/Album';
import type { Playlist } from '@/domain/entities/Playlist';
import type { Song } from '@/domain/entities/Song';
import { ExternalRecommendedSection } from './ExternalRecommendedSection';

const mockFetchAlbum = jest.fn();
const mockReview = jest.fn((_props: { album: Album; track?: { title: string; artist: string } }) => null);
let mockHasTrackDownloader = true;
const mockSongs = [
  { localId: 'song-1', title: 'Selected song', artist: { name: 'Artist A' }, album: { nativeId: 'album-1' } },
  { localId: 'song-2', title: 'Another song', artist: { name: 'Artist B' }, album: { nativeId: 'album-1' } },
] as Song[];

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('react-redux', () => ({ useSelector: () => true }));
jest.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: mockSongs, isLoading: false, isFetching: false }) }));
jest.mock('@/features/theme/useTheme', () => ({ useTheme: () => ({ colors: {} }) }));
jest.mock('@/features/theme/useIconSize', () => ({ useIconSize: () => ({ row: 20 }) }));
jest.mock('@/features/connectivity/useIsOffline', () => ({ useIsOffline: () => false }));
jest.mock('@/features/downloaders/registry', () => ({ useAnyTrackDownloaderConnected: () => mockHasTrackDownloader }));
jest.mock('@/providers/registry/pageSources', () => ({
  SCROBBLES_AVAILABLE: true,
  fetchCatalogueAlbum: (...args: unknown[]) => mockFetchAlbum(...args),
}));
jest.mock('@/providers/registry/artistSources', () => ({ ARTIST_CATALOGUE: { badge: { letter: 'D', color: '#888' } } }));
jest.mock('@/components/useSheetRef', () => ({ useSheetRef: () => ({ current: { present: jest.fn() } }) }));
jest.mock('@/components/options/GetReviewSheet', () => ({ __esModule: true, default: (props: Parameters<typeof mockReview>[0]) => mockReview(props) }));
jest.mock('@/components/toast', () => ({ notify: { error: jest.fn() } }));
jest.mock('@/components/SourceBadge', () => () => null);
jest.mock('@/components/SectionHeader', () => () => null);
jest.mock('@/components/IconActionButton', () => () => null);
jest.mock('@/components/SkeletonListRow', () => () => null);
jest.mock('./Rows', () => ({
  ExternalRow: ({ song, onDownload, hasDownloader }: { song: Song; onDownload: (song: Song) => void; hasDownloader: boolean }) => {
    const { Pressable, Text } = require('react-native');
    return <Pressable onPress={() => onDownload(song)} disabled={!hasDownloader}><Text>{song.title}</Text></Pressable>;
  },
}));

beforeEach(() => {
  mockHasTrackDownloader = true;
  mockReview.mockClear();
  mockFetchAlbum.mockReset().mockResolvedValue({ nativeId: 'album-1', title: 'Containing album' });
});

it('reviews the selected recommendation as one track, even when two songs share an album', async () => {
  const view = await render(<ExternalRecommendedSection playlist={{ localId: 'favourites' } as Playlist} songs={mockSongs} onRefreshExternal={jest.fn()} />);
  await act(async () => { await fireEvent.press(view.getByText('Selected song')); });
  await waitFor(() => expect(mockReview).toHaveBeenLastCalledWith(expect.objectContaining({
    track: { title: 'Selected song', artist: 'Artist A' },
  })));
  await act(async () => { await fireEvent.press(view.getByText('Another song')); });
  await waitFor(() => expect(mockReview).toHaveBeenLastCalledWith(expect.objectContaining({
    track: { title: 'Another song', artist: 'Artist B' },
  })));
});

it('does not offer a track request without a track-capable downloader', async () => {
  mockHasTrackDownloader = false;
  const view = await render(<ExternalRecommendedSection playlist={{ localId: 'favourites' } as Playlist} songs={mockSongs} onRefreshExternal={jest.fn()} />);
  await act(async () => { await fireEvent.press(view.getByText('Selected song')); });
  expect(mockFetchAlbum).not.toHaveBeenCalled();
  expect(mockReview).not.toHaveBeenCalled();
});
