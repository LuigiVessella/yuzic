import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { PlayerLayout } from '../playerLayout';

let mockSong: object | null = null;
jest.mock('@/features/playback/PlayingContext', () => ({ usePlayingState: () => ({ currentSong: mockSong }) }));
jest.mock('react-redux', () => ({ useSelector: () => false }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/features/theme/useRadius', () => ({ useRadius: () => ({ card: 16 }) }));
jest.mock('@/components/Touchable', () => require('react-native').Pressable);
jest.mock('@/components/Text', () => ({ Text: require('react-native').Text }));
jest.mock('./PlayerArtwork', () => require('react-native').View);
jest.mock('./PlayerFavoriteButton', () => require('react-native').View);
jest.mock('./PlayingProgress', () => require('react-native').View);
jest.mock('./PlayingRating', () => require('react-native').View);

import PlayingMain from './PlayingMain';

const layout: PlayerLayout = { mode: 'stacked', coverSize: 240, columnWidth: 300, rowWidth: 300, columnGap: 0, inline: false, bleed: false };

it('renders a selected song, translates its artist hint, and opens the artist', async () => {
  mockSong = { title: 'A song', artist: { name: 'An artist' }, contentKind: 'song', durationSeconds: 180 };
  const open = jest.fn();
  const screen = await render(<PlayingMain layout={layout} onPressArtist={open} />);
  expect(screen.getByText('A song')).toBeTruthy();
  const artist = screen.getByRole('link');
  expect(artist.props.accessibilityHint).toBe('a11y.player.goToArtist');
  await fireEvent.press(artist);
  expect(open).toHaveBeenCalledTimes(1);
});

it('can mount before a song exists and render when playback starts', async () => {
  mockSong = null;
  const screen = await render(<PlayingMain layout={layout} />);
  expect(screen.queryByText('A song')).toBeNull();
  mockSong = { title: 'A song', artist: { name: 'An artist' }, contentKind: 'song', durationSeconds: 180 };
  await screen.rerender(<PlayingMain layout={{ ...layout, inline: true }} />);
  expect(screen.getByText('A song')).toBeTruthy();
});
