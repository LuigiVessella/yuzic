import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockNext = jest.fn().mockResolvedValue(undefined);
const mockPrevious = jest.fn().mockResolvedValue(undefined);
const mockError = jest.fn();
const mockRetry = jest.fn();
let mockActive = true;
const mockSongs = ['previous', 'current', 'next'].map(localId => ({ localId, cover: { kind: 'url', url: `https://music.test/${localId}` } }));
const mockActions = { getQueue: () => mockSongs, skipToNext: mockNext, skipToPrevious: mockPrevious };
const mockExpansion = { expansion: { value: 1 }, scrollY: { value: 0 }, interactionEpoch: { value: 0 }, isOpen: true };
jest.mock('@/features/playback/PlayingContext', () => ({
  usePlayingState: () => ({ currentSong: mockSongs[1], currentIndex: 1, repeatMode: 'off' }),
  usePlayingActions: () => mockActions, usePlayingQueueVersion: () => 0,
}));
jest.mock('../PlayerExpansion', () => ({ usePlayerExpansion: () => mockExpansion }));
jest.mock('@/features/layout/useWindowLayout', () => ({ useWindowLayout: () => ({ height: 800 }) }));
jest.mock('@/features/theme/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('@/features/artwork/imageCache', () => ({ prefetchCovers: jest.fn(), markImageUrlSucceeded: (uri: string) => mockRetry(uri) }));
jest.mock('@/features/connectivity/useAppActive', () => ({ useAppActive: () => mockActive }));
jest.mock('@/providers/registry/covers', () => ({ buildCover: (cover: { url: string }) => cover.url }));
jest.mock('@/components/toast', () => ({ notify: { error: (...args: unknown[]) => mockError(...args) } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/components/MediaImage', () => ({
  MediaImage: function MockImage(props: object) {
    const { View } = require('react-native');
    return <View testID="cover-image" {...props} />;
  },
}));
jest.mock('react-native-gesture-handler', () => {
  const chain: object = new Proxy({}, { get: () => () => chain });
  return {
    Gesture: { Pan: () => chain, Native: () => chain, Simultaneous: () => chain },
    GestureDetector: function MockDetector({ children }: { children: React.ReactNode }) { return children; },
  };
});

import PlayerArtwork from './PlayerArtwork';

beforeEach(() => { mockActive = true; mockRetry.mockClear(); mockNext.mockClear(); mockPrevious.mockClear(); mockError.mockClear(); });

it('contains the real cover and neighbours inside a fixed, clipped square', async () => {
  const screen = await render(<PlayerArtwork size={240} corner={16} />);
  const style = StyleSheet.flatten(screen.getByTestId('player-artwork').props.style);
  expect(style).toMatchObject({ width: 240, height: 240, overflow: 'hidden' });
  expect(screen.getAllByTestId('cover-image').map(item => item.props.cover)).toEqual(mockSongs.map(song => song.cover));
});

it('keeps accessible skip controls usable after a rejected player command', async () => {
  mockNext.mockRejectedValueOnce(new Error('no connection'));
  const screen = await render(<PlayerArtwork size={240} corner={16} />);
  const cover = screen.getByTestId('player-artwork');
  await fireEvent(cover, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  await waitFor(() => expect(mockError).toHaveBeenCalled());
  await fireEvent(cover, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  await waitFor(() => expect(mockPrevious).toHaveBeenCalledTimes(1));
});

it('retries the current cover once when returning from the lock screen', async () => {
  const screen = await render(<PlayerArtwork size={240} corner={16} />);
  expect(mockRetry).not.toHaveBeenCalled();
  mockActive = false;
  await screen.rerender(<PlayerArtwork size={240} corner={16} />);
  mockActive = true;
  await screen.rerender(<PlayerArtwork size={240} corner={16} />);
  expect(mockRetry).toHaveBeenCalledWith(mockSongs[1].cover.url);
  expect(mockRetry).toHaveBeenCalledTimes(3);
  await screen.rerender(<PlayerArtwork size={240} corner={16} />);
  expect(mockRetry).toHaveBeenCalledTimes(3);
});
