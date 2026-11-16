import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockSkip = jest.fn();
const mockSong = { localId: 'same-song', title: 'Repeated song', artist: { name: 'Artist' }, album: {}, cover: { kind: 'none' } };
const mockQueue = [mockSong, mockSong];
const mockActions = { getQueue: () => mockQueue, skipTo: mockSkip, moveTrack: jest.fn() };
const mockKeys: string[] = [];

jest.mock('@/features/playback/PlayingContext', () => ({
  usePlayingState: () => ({ currentSong: mockSong, currentIndex: 1, isPlaying: false }),
  usePlayingActions: () => mockActions,
  usePlayingQueueVersion: () => 0,
}));
jest.mock('react-native-reorderable-list', () => ({
  __esModule: true,
  default: ({ data, renderItem, keyExtractor }: {
    data: unknown[]; renderItem: (entry: { item: unknown; index: number }) => React.ReactNode;
    keyExtractor: (item: unknown, index: number) => string;
  }) => {
    const { View } = require('react-native');
    return data.map((item, index) => {
      const key = keyExtractor(item, index);
      mockKeys.push(key);
      return <View key={key}>{renderItem({ item, index })}</View>;
    });
  },
  useReorderableDrag: () => jest.fn(),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/features/album/useAlbumsById', () => ({ useAlbumsById: () => new Map() }));
jest.mock('@/features/theme/useRadius', () => ({ useRadius: () => ({ md: 8 }) }));
jest.mock('@/features/theme/useListDensity', () => ({ useListDensity: () => ({ trackRowPadding: 4 }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
jest.mock('@/components/Touchable', () => require('react-native').Pressable);
jest.mock('@/components/Text', () => ({ Text: require('react-native').Text }));
jest.mock('@/components/MediaImage', () => ({ MediaImage: require('react-native').View }));

import Queue from './Queue';

it('highlights only the playing occurrence and selects duplicate songs by queue position', async () => {
  const screen = await render(<Queue onBack={jest.fn()} width={390} />);
  expect(screen.getAllByRole('button', { selected: true })).toHaveLength(1);
  const occurrences = screen.getAllByText('Repeated song');
  // Header first, followed by both independent queue entries.
  await fireEvent.press(occurrences[1]);
  expect(mockSkip).toHaveBeenLastCalledWith(0);
  await fireEvent.press(occurrences[2]);
  expect(mockSkip).toHaveBeenLastCalledWith(1);
  expect(new Set(mockKeys).size).toBe(2);
});
