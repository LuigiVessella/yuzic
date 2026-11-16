import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { LyricsResult } from '@/providers/contracts/ServerAdapter';

let mockPosition = 0;
const mockScroll = jest.fn();
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    BottomSheetModal: React.forwardRef(function MockModal(props: object, _ref: unknown) { return <View {...props} />; }),
    BottomSheetScrollView: React.forwardRef(function MockScroll(props: object, ref: unknown) {
      React.useImperativeHandle(ref, () => ({ scrollTo: mockScroll }));
      return <View testID="lyrics-scroll" {...props} />;
    }),
  };
});
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/features/playback/PlayingContext', () => ({
  usePlayingProgress: () => ({ position: mockPosition }), usePlayingActions: () => ({ seekSong: jest.fn() }),
}));
jest.mock('@/features/theme/useTheme', () => ({ useTheme: () => ({ colors: { secondary: '#fff', subtext: '#aaa' } }) }));
jest.mock('@/features/theme/useReducedMotion', () => ({ useReducedMotion: () => false }));
jest.mock('@/components/options/OptionSheetPrimitives', () => ({
  optionSheetStyles: {}, useSheetBottomInset: () => 0, useOptionSheetBackground: () => ({}),
}));
jest.mock('@/components/BottomSheetBackdrop', () => ({ renderBackdrop: jest.fn() }));
jest.mock('@/components/Touchable', () => require('react-native').Pressable);
jest.mock('@/components/Text', () => ({ Text: require('react-native').Text }));
jest.mock('./CompactPlaybackControl', () => require('react-native').View);

import LyricsBottomSheet from './LyricsBottomSheet';
const lyrics: LyricsResult = { synced: true, lines: [{ startMs: 0, text: 'First line' }, { startMs: 10000, text: 'Second line' }] };

beforeEach(() => { mockPosition = 0; mockScroll.mockClear(); });

it('lets manual reading pause auto-follow and resumes explicitly at the current verse', async () => {
  const close = jest.fn();
  const screen = await render(<LyricsBottomSheet lyrics={lyrics} onClose={close} />);
  const scroll = screen.getByTestId('lyrics-scroll');
  await fireEvent(scroll, 'layout', { nativeEvent: { layout: { height: 400 } } });
  await fireEvent(scroll, 'contentSizeChange', 300, 1000);
  await fireEvent(screen.getByText('First line'), 'layout', { nativeEvent: { layout: { y: 0, height: 80 } } });
  await fireEvent(screen.getByText('Second line'), 'layout', { nativeEvent: { layout: { y: 300, height: 80 } } });
  await fireEvent(scroll, 'scrollBeginDrag');
  mockScroll.mockClear();
  mockPosition = 12;
  await screen.rerender(<LyricsBottomSheet lyrics={lyrics} onClose={close} />);
  expect(mockScroll).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('lyrics-resume-following'));
  expect(mockScroll).toHaveBeenCalled();
  expect(screen.queryByTestId('lyrics-resume-following')).toBeNull();
});

it('does not offer auto-follow for untimed lyrics', async () => {
  const screen = await render(<LyricsBottomSheet lyrics={{ ...lyrics, synced: false }} onClose={jest.fn()} />);
  await fireEvent(screen.getByTestId('lyrics-scroll'), 'scrollBeginDrag');
  expect(screen.queryByTestId('lyrics-resume-following')).toBeNull();
});
