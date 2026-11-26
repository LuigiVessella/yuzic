import { useEffect } from 'react';
import { motion } from '@/constants/design';
import { useReducedMotion } from '@/features/theme/useReducedMotion';
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export type PlayingViewMode = 'player' | 'queue';


/** The crossfade between the player and the queue on the playing screen. */
export function usePlayingTransitions(
  mode: PlayingViewMode,
) {
  const reduced = useReducedMotion();
  const duration = reduced ? 0 : motion.modeChange;
  const playerOpacity = useSharedValue(1);
  const queueOpacity = useSharedValue(0);

  useEffect(() => {
    playerOpacity.value = withTiming(mode === 'player' ? 1 : 0, { duration });
    queueOpacity.value = withTiming(mode === 'queue' ? 1 : 0, { duration });

  }, [mode, playerOpacity, queueOpacity, duration]);

  const playerStyle = useAnimatedStyle(() => ({
    opacity: playerOpacity.value,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  }));

  const queueStyle = useAnimatedStyle(() => ({
    opacity: queueOpacity.value,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  }));

  return { playerStyle, queueStyle };
}
