import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { cancelAnimation, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

import { motion } from '@/constants/design';
import { PLAYER_SPRING } from '@/features/player/PlayerExpansion';
import { settleFromPlayer } from '@/features/player/settle';

/**
 * A downward drag on the header or artwork moves the whole panel. A gesture
 * begun while the body is scrolled stays owned by the scroll view; reaching
 * the top requires a fresh drag to close. Controls never inherit this pan.
 */
export function useDragToClose(
  expansion: SharedValue<number>,
  scrollY: SharedValue<number>,
  height: number,
  interactionEpoch?: SharedValue<number>,
  reduced = false,
) {
  // Whether the pan has actually moved the player, as opposed to being a
  // scroll that its sibling gesture handled. A gesture that decided nothing
  // must not settle as though it decided something — see `settle.ts`.
  const dragMoved = useSharedValue(false);
  const gestureEpoch = useSharedValue(0);
  const startedAtTop = useSharedValue(true);
  const startExpansion = useSharedValue(1);
  const startTranslation = useSharedValue(0);

  return useMemo(
    () =>
      Gesture.Pan()
          .activeOffsetY(12)
          .failOffsetY(-12)
          .failOffsetX([-14, 14])
          .onBegin(() => {
            dragMoved.value = false;
            startedAtTop.value = scrollY.value <= 0;
            gestureEpoch.value = interactionEpoch?.value ?? 0;
          })
          .onUpdate(event => {
            if (interactionEpoch && gestureEpoch.value !== interactionEpoch.value) return;
            if (!dragMoved.value) {
              if (!startedAtTop.value || event.translationY <= 0) return;
              // Take over once, from the current position, including when a
              // new drag interrupts the spring of the previous one. Movement
              // already consumed by scrolling must not collapse the player.
              cancelAnimation(expansion);
              startExpansion.value = Math.max(0, Math.min(1, expansion.value));
              startTranslation.value = event.translationY;
              dragMoved.value = true;
            }
            // Once claimed, follow reversals too: rechecking scroll/translation
            // here can strand the surface halfway through the same drag.
            expansion.value = Math.max(0, Math.min(1,
              startExpansion.value - (event.translationY - startTranslation.value) / height,
            ));
          })
          // `onFinalize`, not `onEnd`: a gesture that is cancelled or
          // interrupted — by the scroll view winning, by another
          // animation, by the touch being stolen — never reaches
          // `onEnd` at all, and that is the exit that used to leave
          // `expansion` parked at an intermediate value with the
          // playing bar faded to invisible (#211). `onFinalize` runs
          // for every ending, so there is exactly one way out and it
          // always names 0 or 1.
          .onFinalize(event => {
            if (interactionEpoch && gestureEpoch.value !== interactionEpoch.value) return;
            const target = settleFromPlayer(expansion.value, event.velocityY, dragMoved.value);
            // A tap: the pressable already started the spring it meant.
            if (target === null) return;
            expansion.value = reduced ? withTiming(target, { duration: motion.quick }) : withSpring(target, PLAYER_SPRING);
          }),
    [dragMoved, expansion, height, scrollY, startExpansion, startTranslation, interactionEpoch, gestureEpoch, startedAtTop, reduced],
  );
}
