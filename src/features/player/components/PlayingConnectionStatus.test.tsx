import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

let mockOffline = false;
let mockReachable = true;
jest.mock('@/features/connectivity/useIsOffline', () => ({ useIsOffline: () => mockOffline }));
jest.mock('@/features/connectivity/useServerReachable', () => ({ useServerReachable: () => mockReachable }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/components/Touchable', () => require('react-native').Pressable);
jest.mock('@/components/Text', () => ({ Text: require('react-native').Text }));

import PlayingConnectionStatus from './PlayingConnectionStatus';

beforeEach(() => { mockOffline = false; mockReachable = true; });

it('does not disturb the player when connected', async () => {
  const screen = await render(<PlayingConnectionStatus onDownloads={jest.fn()} />);
  expect(screen.queryByTestId('playing-connection-status')).toBeNull();
});

it('offers explicit retry when the connection is available again', async () => {
  const retry = jest.fn(async () => {});
  const screen = await render(<PlayingConnectionStatus onDownloads={jest.fn()} onRetry={retry} />);
  await fireEvent.press(screen.getByText('common.retry'));
  expect(retry).toHaveBeenCalledTimes(1);
});

it('distinguishes an unreachable server and opens the saved music action', async () => {
  mockReachable = false;
  const open = jest.fn();
  const screen = await render(<PlayingConnectionStatus onDownloads={open} />);
  expect(screen.getByText('playing.connection.serverUnreachable')).toBeTruthy();
  await fireEvent.press(screen.getByText('home.filters.downloaded'));
  expect(open).toHaveBeenCalledTimes(1);
});

it('explains loss of network separately from server failure', async () => {
  mockOffline = true;
  mockReachable = false;
  const screen = await render(<PlayingConnectionStatus onDownloads={jest.fn()} />);
  expect(screen.getByText('playing.connection.offline')).toBeTruthy();
  expect(screen.queryByText('playing.connection.serverUnreachable')).toBeNull();
});
