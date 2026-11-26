import { hasImageUrlFailed, markImageUrlFailed, markImageUrlSucceeded, subscribeImageFailures } from './imageCache';

jest.mock('react-native-turbo-image', () => ({ prefetch: jest.fn() }));
jest.mock('@/providers/registry/covers', () => ({ buildCover: jest.fn(), buildCoverCacheKey: jest.fn() }));
jest.mock('@/state/mmkvStorage', () => ({ mmkv: {} }));

it('lets a transient image failure retry on a later render', () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
  markImageUrlFailed('temporary');
  expect(hasImageUrlFailed('temporary')).toBe(true);
  clock.mockReturnValue(31_001);
  expect(hasImageUrlFailed('temporary')).toBe(false);
  clock.mockRestore();
});

it('notifies mounted images when another surface recovers a URL', () => {
  const listener = jest.fn();
  const unsubscribe = subscribeImageFailures(listener);
  markImageUrlFailed('recovered');
  expect(listener).toHaveBeenCalledTimes(1);
  markImageUrlSucceeded('recovered');
  expect(listener).toHaveBeenCalledTimes(2);
  expect(hasImageUrlFailed('recovered')).toBe(false);
  unsubscribe();
  markImageUrlFailed('after-unsubscribe');
  expect(listener).toHaveBeenCalledTimes(2);
});
