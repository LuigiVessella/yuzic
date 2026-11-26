import React from 'react';
import { BackHandler, StyleSheet } from 'react-native';
import { render, within } from '@testing-library/react-native';

const mockCollapse = jest.fn();
let mockReduced = false;
let mockOpen = true;
jest.mock('./PlayerExpansion', () => ({ usePlayerExpansion: () => ({
  expansion: { value: 0.5 }, isOpen: mockOpen, hasOpened: true, collapse: mockCollapse,
}) }));
jest.mock('./PlayingScreen', () => {
  const { View } = require('react-native');
  return function MockPlayingScreen() { return <View testID="mock-player-cover" />; };
});
jest.mock('@/features/playback/PlayingContext', () => ({ usePlayingState: () => ({ currentSong: null }) }));
jest.mock('@/features/theme/useCoverAccent', () => ({ useCoverAccent: () => null }));
jest.mock('@/features/theme/useLiveCoverAccent', () => ({ useLiveCoverAccent: () => {} }));
jest.mock('@/features/theme/useRadius', () => ({ useRadius: () => ({ panel: 20 }) }));
jest.mock('@/features/theme/useReducedMotion', () => ({ useReducedMotion: () => mockReduced }));

jest.mock('expo-linear-gradient', () => ({ LinearGradient: require('react-native').View }));

import PlayerHost from './PlayerHost';

beforeEach(() => { mockOpen = true; mockReduced = false; mockCollapse.mockClear(); });

it('moves a single panel containing the player artwork', async () => {
  const screen = await render(<PlayerHost />);
  const panel = screen.getByTestId('player-panel');
  expect(within(panel).getByTestId('mock-player-cover')).toBeTruthy();
  const style = StyleSheet.flatten(panel.props.style);
  expect(style.overflow).toBe('hidden');
  expect(style.transform[0].translateY).toBeGreaterThan(0);
  expect(style.opacity).toBe(1);
});

it('fades in place when reduced motion is enabled', async () => {
  mockReduced = true;
  const screen = await render(<PlayerHost />);
  const style = StyleSheet.flatten(screen.getByTestId('player-panel').props.style);
  expect(style.transform[0].translateY).toBe(0);
  expect(style.opacity).toBe(0.5);
});

it('releases touches and accessibility to the app when closed', async () => {
  mockOpen = false;
  const screen = await render(<PlayerHost />);
  const host = screen.getByTestId('player-host', { includeHiddenElements: true });
  expect(host.props.pointerEvents).toBe('none');
  expect(host.props.importantForAccessibility).toBe('no-hide-descendants');
});

it('routes Android Back to the same close command', async () => {
  const subscription = jest.spyOn(BackHandler, 'addEventListener');
  const screen = await render(<PlayerHost />);
  expect(subscription.mock.calls[0][1]()).toBe(true);
  expect(mockCollapse).toHaveBeenCalledTimes(1);
  await screen.unmount();
  subscription.mockRestore();
});
