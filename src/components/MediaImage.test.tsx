import React from 'react';
import { act, render } from '@testing-library/react-native';
import { MediaImage } from './MediaImage';
import type { CoverSource } from '@/domain/entities/Cover';
import { markImageUrlSucceeded } from '@/features/artwork/imageCache';

const mockResolvedCovers = new Map<string, CoverSource>();

jest.mock('react-redux', () => ({ useSelector: () => 'server' }));
jest.mock('@/state/redux/selectors/serversSelectors', () => ({ selectActiveServerId: jest.fn() }));
jest.mock('@/features/theme/useTheme', () => ({ useTheme: () => ({ colors: {}, isDarkMode: false }) }));
jest.mock('@/features/artwork/useResolvedCover', () => ({
  useResolvedCover: (cover: CoverSource) => ({ cover: mockResolvedCovers.get(JSON.stringify(cover)) ?? cover }),
}));
jest.mock('@/components/ThemedHeartCover', () => () => null);
jest.mock('@/components/ThemedRadioCover', () => () => null);
jest.mock('@/providers/registry/covers', () => ({
  buildCover: (cover: CoverSource) => cover.kind === 'url' ? cover.url : null,
  buildCoverCacheKey: () => null,
  coverIdentity: () => null,
  DRAWN_COVER: { heart: 'heart', radio: 'radio' },
}));
jest.mock('react-native-turbo-image', () => {
  const { View } = require('react-native');
  return function MockImage({ source, onFailure, onSuccess }: { source: { uri: string }; onFailure: () => void; onSuccess: () => void }) {
    return <View testID={source.uri} onTouchEnd={onFailure} onLayout={onSuccess} />;
  };
});

const album = { kind: 'url', url: 'https://example.test/album.jpg' } as const;

it('uses album artwork when the track has no cover', async () => {
  const view = await render(<MediaImage cover={{ kind: 'none' }} fallbackCover={album} size="thumb" />);
  expect(view.getByTestId(album.url)).toBeTruthy();
});

it('replaces a failed track image with album artwork', async () => {
  const track = { kind: 'url', url: 'https://example.test/track.jpg' } as const;
  const view = await render(<MediaImage cover={track} fallbackCover={album} size="thumb" />);
  expect(view.queryByTestId(album.url)).toBeNull();
  await act(async () => view.getByTestId(track.url).props.onTouchEnd());
  expect(view.getByTestId(album.url)).toBeTruthy();
});

it('resolves an album fallback whose missing cover names the album', async () => {
  const gap: CoverSource = { kind: 'none', subject: { kind: 'album', title: 'Sinatra', artistName: 'Guè' } };
  mockResolvedCovers.set(JSON.stringify(gap), album);
  const view = await render(<MediaImage cover={{ kind: 'none' }} fallbackCover={gap} size="thumb" />);
  expect(view.getByTestId(album.url)).toBeTruthy();
});

it('updates an already mounted tile when another surface recovers its image', async () => {
  const track = { kind: 'url', url: 'https://example.test/recovered-track.jpg' } as const;
  const view = await render(<MediaImage cover={track} fallbackCover={album} size="thumb" />);
  await act(async () => view.getByTestId(track.url).props.onTouchEnd());
  expect(view.getByTestId(album.url)).toBeTruthy();
  await act(async () => markImageUrlSucceeded(track.url));
  expect(view.getByTestId(track.url)).toBeTruthy();
});

it('stops at a placeholder if track and album reference the same failed image', async () => {
  const track = { kind: 'url', url: 'https://example.test/same-track-album.jpg' } as const;
  const view = await render(<MediaImage cover={track} fallbackCover={track} size="thumb" />);
  await act(async () => view.getByTestId(track.url).props.onTouchEnd());
  expect(view.queryByTestId(track.url)).toBeNull();
});
