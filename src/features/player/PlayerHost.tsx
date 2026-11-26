import React, { useEffect } from 'react';
import { BackHandler, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { interpolate, Extrapolation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { motion, onDark, playerSurface } from '@/constants/design';
import { usePlayingState } from '@/features/playback/PlayingContext';
import { useCoverAccent } from '@/features/theme/useCoverAccent';
import { useLiveCoverAccent } from '@/features/theme/useLiveCoverAccent';
import { useRadius } from '@/features/theme/useRadius';
import { useReducedMotion } from '@/features/theme/useReducedMotion';
import PlayingScreen from './PlayingScreen';
import { usePlayerExpansion } from './PlayerExpansion';

/** One clipped surface: artwork and controls always travel together. */
export default function PlayerHost() {
  const { expansion, isOpen, hasOpened, collapse } = usePlayerExpansion();
  const { height } = useWindowDimensions();
  const { currentSong } = usePlayingState();
  const accent = useCoverAccent(currentSong?.cover);
  const reduced = useReducedMotion();
  const rad = useRadius();
  const wash = useSharedValue(0);
  useLiveCoverAccent();

  useEffect(() => {
    wash.value = withTiming(accent ? playerSurface.washOpacity : 0, { duration: reduced ? 0 : motion.washArrival });
  }, [accent, reduced, wash]);

  useEffect(() => {
    if (!isOpen) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      collapse();
      return true;
    });
    return () => subscription.remove();
  }, [isOpen, collapse]);

  const surfaceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: reduced ? 0 : (1 - expansion.value) * height }],
    opacity: reduced ? expansion.value : 1,
    borderTopLeftRadius: interpolate(expansion.value, [0, 1], [rad.panel, 0], Extrapolation.CLAMP),
    borderTopRightRadius: interpolate(expansion.value, [0, 1], [rad.panel, 0], Extrapolation.CLAMP),
  }));
  const washStyle = useAnimatedStyle(() => ({ opacity: wash.value }));

  return (
    <View testID="player-host" style={StyleSheet.absoluteFill} pointerEvents={isOpen ? 'auto' : 'none'}
      accessibilityElementsHidden={!isOpen}
      importantForAccessibility={isOpen ? 'auto' : 'no-hide-descendants'}>
      <Animated.View testID="player-panel" style={[StyleSheet.absoluteFill, styles.surface, surfaceStyle]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, washStyle]}>
          <LinearGradient colors={[accent ?? onDark.wash, onDark.background]} style={StyleSheet.absoluteFill} />
        </Animated.View>
        {hasOpened ? <PlayingScreen onClose={collapse} /> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: { backgroundColor: onDark.background, overflow: 'hidden' },
});
