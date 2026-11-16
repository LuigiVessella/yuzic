import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { Song } from '@/domain/entities/Song';

const mockStar = jest.fn().mockResolvedValue(undefined);
const mockUnstar = jest.fn().mockResolvedValue(undefined);
const mockError = jest.fn();
let mockSongs: Song[] = [];
jest.mock('react-redux', () => ({ useSelector: () => ({ id: 'server' }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/features/library/useStarSong', () => ({ useStarSong: () => ({ mutateAsync: mockStar }) }));
jest.mock('@/features/library/useUnstarSong', () => ({ useUnstarSong: () => ({ mutateAsync: mockUnstar }) }));
jest.mock('@/features/library/useStarredSongs', () => ({ useStarredSongs: () => ({ songs: mockSongs }) }));
jest.mock('@/features/connectivity/useIsOffline', () => ({ useIsOffline: () => true }));
jest.mock('@/components/haptics', () => ({ selection: () => {} }));
jest.mock('@/components/toast', () => ({ notify: { success: () => {}, error: (...args: unknown[]) => mockError(...args) } }));
jest.mock('@/components/Touchable', () => require('react-native').Pressable);

import PlayerFavoriteButton from './PlayerFavoriteButton';
const song = { localId: 'song', nativeId: 'native', title: 'Title', provenance: { origin: 'server', serverId: 'server' } } as Song;

beforeEach(() => { mockSongs = []; mockStar.mockClear(); mockUnstar.mockClear(); mockError.mockClear(); });

it('uses the existing offline-aware favorite mutation', async () => {
  const screen = await render(<PlayerFavoriteButton song={song} />);
  await fireEvent.press(screen.getByRole('button'));
  expect(mockStar).toHaveBeenCalledWith(song);
});

it('shows the shared favorite state and removes by server id', async () => {
  mockSongs = [song];
  const screen = await render(<PlayerFavoriteButton song={song} />);
  await fireEvent.press(screen.getByRole('button', { selected: true }));
  expect(mockUnstar).toHaveBeenCalledWith('native');
});

it('does not send foreign server or integration ids to the active server', async () => {
  const foreign = { ...song, provenance: { origin: 'integration', providerId: 'deezer' } } as Song;
  const screen = await render(<PlayerFavoriteButton song={foreign} />);
  expect(screen.queryByRole('button')).toBeNull();
  expect(mockStar).not.toHaveBeenCalled();
});
