import { renderHook } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

type PanEvent = { translationY: number; velocityY: number };
type Handlers = Record<string, (event: PanEvent) => void>;
/* eslint-disable no-var -- initialized by the hoisted gesture mock */
var mockHandlers: Handlers = {};
/* eslint-enable no-var */

jest.mock('react-native-gesture-handler', () => ({
  Gesture: {
    Pan: () => {
      mockHandlers = {};
      const chain = {
        activeOffsetY: () => chain, failOffsetY: () => chain, failOffsetX: () => chain,
        onBegin: (fn: Handlers[string]) => { mockHandlers.begin = fn; return chain; },
        onUpdate: (fn: Handlers[string]) => { mockHandlers.update = fn; return chain; },
        onFinalize: (fn: Handlers[string]) => { mockHandlers.finalize = fn; return chain; },
      };
      return chain;
    },
    Native: () => ({}),
    Simultaneous: () => ({}),
  },
}));

import { useDragToClose } from './useDragToClose';

async function drag(initialExpansion = 1, initialScroll = 0) {
  const { result } = await renderHook(() => {
    const expansion = Reanimated.useSharedValue(initialExpansion);
    const scroll = Reanimated.useSharedValue(initialScroll);
    const epoch = Reanimated.useSharedValue(0);
    useDragToClose(expansion, scroll, 1000, epoch);
    return { expansion, scroll, epoch };
  });
  const event = (translationY = 0, velocityY = 0) => ({ translationY, velocityY });
  mockHandlers.begin(event());
  return {
    ...result.current,
    begin: () => mockHandlers.begin(event()),
    update: (y: number) => mockHandlers.update(event(y)),
    finalize: (velocity = 0) => mockHandlers.finalize(event(0, velocity)),
  };
}

afterEach(() => jest.restoreAllMocks());

it('follows a reversal past the initial touch instead of leaving the cover displaced', async () => {
  const pan = await drag();
  pan.update(20);
  pan.update(220);
  expect(pan.expansion.value).toBeCloseTo(0.8);
  pan.update(-20);
  expect(pan.expansion.value).toBe(1);
  pan.finalize();
  expect(pan.expansion.value).toBe(1);
});

it('takes over an interrupted spring without jumping back to fully open', async () => {
  const cancel = jest.spyOn(Reanimated, 'cancelAnimation');
  const pan = await drag(0.6);
  pan.update(20);
  expect(cancel).toHaveBeenCalledWith(pan.expansion);
  expect(pan.expansion.value).toBe(0.6);
  pan.update(120);
  expect(pan.expansion.value).toBeCloseTo(0.5);
  pan.finalize();
  expect(pan.expansion.value).toBe(0);
});

it('keeps a scroll gesture owned by the scroll view until a fresh drag', async () => {
  const pan = await drag(1, 200);
  pan.update(180);
  expect(pan.expansion.value).toBe(1);
  pan.scroll.value = 0;
  pan.update(220);
  expect(pan.expansion.value).toBe(1);
  pan.update(320);
  expect(pan.expansion.value).toBe(1);
  pan.finalize();
  pan.begin();
  pan.update(20);
  pan.update(120);
  expect(pan.expansion.value).toBeCloseTo(0.9);
});

it('keeps following the drag when the simultaneous scroll changes direction', async () => {
  const pan = await drag();
  pan.update(20);
  pan.update(320);
  pan.scroll.value = 40;
  pan.update(120);
  expect(pan.expansion.value).toBeCloseTo(0.9);
  pan.finalize();
  expect(pan.expansion.value).toBe(1);
});

it('settles an interrupted drag to an endpoint on finalization', async () => {
  const pan = await drag();
  pan.update(20);
  pan.update(420);
  pan.finalize();
  expect(pan.expansion.value).toBe(0);
});

it('leaves taps and ordinary scrolling to their existing handlers', async () => {
  const cancel = jest.spyOn(Reanimated, 'cancelAnimation');
  const pan = await drag(0.6, 100);
  pan.update(50);
  pan.finalize();
  expect(pan.expansion.value).toBe(0.6);
  expect(cancel).not.toHaveBeenCalled();
});

it('lets an explicit close override an active drag, including its finalization', async () => {
  const pan = await drag();
  pan.update(20);
  pan.update(220);
  pan.epoch.value += 1;
  pan.expansion.value = 0;
  pan.update(40);
  pan.finalize(-1000);
  expect(pan.expansion.value).toBe(0);
});
