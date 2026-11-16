import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { MediaImage } from '@/components/MediaImage';
import { notify } from '@/components/toast';
import { motion, onDark } from '@/constants/design';
import type { CoverSource } from '@/domain/entities/Cover';
import { usePlayingActions, usePlayingQueueVersion, usePlayingState } from '@/features/playback/PlayingContext';
import { buildCover } from '@/providers/registry/covers';
import { useAppActive } from '@/features/connectivity/useAppActive';
import { markImageUrlSucceeded, prefetchCovers } from '@/features/artwork/imageCache';
import { useWindowLayout } from '@/features/layout/useWindowLayout';
import { useReducedMotion } from '@/features/theme/useReducedMotion';
import { usePlayerExpansion } from '../PlayerExpansion';
import { coverNeighbours } from '../coverNeighbours';
import { canStartCoverSlide } from '../coverTransition';
import { resolveCoverSwipe } from '../coverSwipe';
import { useDragToClose } from '../useDragToClose';

type Strip = { current: CoverSource | null; previous: CoverSource | null; next: CoverSource | null };

/** A clipped carousel inside the panel, never an overlay above the navigator. */
export default function PlayerArtwork({ size, corner }: { size: number; corner: number }) {
  const { t } = useTranslation();
  const { currentSong, currentIndex, repeatMode } = usePlayingState();
  const { getQueue, skipToNext, skipToPrevious } = usePlayingActions();
  const version = usePlayingQueueVersion();
  const { expansion, scrollY, interactionEpoch, isOpen } = usePlayerExpansion();
  const { height } = useWindowLayout();
  const reduced = useReducedMotion();
  const close = useDragToClose(expansion, scrollY, height, interactionEpoch, reduced);
  const offset = useSharedValue(0);
  const busy = useSharedValue(false);
  const [frozen, setFrozen] = useState<Strip | null>(null);
  const strip = useMemo<Strip>(() => ({
    current: currentSong?.cover ?? null,
    ...coverNeighbours(getQueue(), currentIndex, repeatMode),
    // Queue edits may change neighbours without changing the current song.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [currentSong, getQueue, currentIndex, repeatMode, version]);
  const visible = frozen ?? strip;
  const appActive = useAppActive();
  const previousActive = useRef(appActive);
  const [imageVersion, setImageVersion] = useState(0);
  const songId = useRef(currentSong?.localId);
  songId.current = currentSong?.localId;
  const length = getQueue().length;

  useEffect(() => { prefetchCovers([strip.current, strip.previous, strip.next], 'detail'); }, [strip]);

  useEffect(() => {
    if (!isOpen || !appActive) {
      cancelAnimation(offset);
      offset.value = 0;
      busy.value = false;
      setFrozen(null);
    }
  }, [isOpen, appActive, offset, busy]);

  // Android may discard an image surface or fail an in-flight load while
  // locked. Retry the visible artwork once per foreground transition, using
  // the shared disk cache, rather than leaving its failure placeholder stuck.
  useEffect(() => {
    const resumed = appActive && !previousActive.current;
    previousActive.current = appActive;
    if (!resumed) return;
    for (const cover of [strip.current, strip.previous, strip.next]) {
      const uri = cover ? buildCover(cover, 'detail') : null;
      if (uri) markImageUrlSucceeded(uri);
    }
    setImageVersion(version => version + 1);
  }, [appActive, strip]);

  const commit = useCallback(async (direction: 'next' | 'previous', expectedId: string | undefined) => {
    try {
      if (songId.current !== expectedId) return;
      await (direction === 'next' ? skipToNext() : skipToPrevious());
    }
    catch { notify.error(t('library.collection.playFailed')); }
    finally { offset.value = 0; busy.value = false; setFrozen(null); }
  }, [skipToNext, skipToPrevious, offset, busy, t]);
  const freeze = useCallback(() => setFrozen(strip), [strip]);

  const horizontal = useMemo(() => Gesture.Pan()
    .activeOffsetX([-12, 12]).failOffsetY([-14, 14])
    .onUpdate(event => { if (!busy.value) offset.value = Math.max(-size, Math.min(size, event.translationX)); })
    .onEnd(event => {
      if (busy.value) return;
      const direction = resolveCoverSwipe(event.translationX, event.velocityX, size);
      if (direction === 'cancel' || !canStartCoverSlide(direction, currentIndex, length, repeatMode)) {
        offset.value = withSpring(0);
        return;
      }
      busy.value = true;
      runOnJS(freeze)();
      offset.value = withTiming(direction === 'next' ? -size : size,
        { duration: reduced ? 0 : motion.swipe }, finished => {
          if (finished) runOnJS(commit)(direction, currentSong?.localId);
        });
    })
    .onFinalize((_event, success) => {
      if (!success && !busy.value) offset.value = withSpring(0);
    }), [busy, offset, size, currentIndex, length, repeatMode, freeze, reduced, commit, currentSong?.localId]);

  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  return (
    <GestureDetector gesture={Gesture.Simultaneous(horizontal, close)}>
      <Animated.View testID="player-artwork" style={[styles.frame, { width: size, height: size, borderRadius: corner }]}
        accessible accessibilityRole="adjustable" accessibilityLabel={t('a11y.player.coverArt')}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={event => {
          if (busy.value) return;
          if (!['increment', 'decrement'].includes(event.nativeEvent.actionName)) return;
          const direction = event.nativeEvent.actionName === 'increment' ? 'next' : 'previous';
          if (canStartCoverSlide(direction, currentIndex, length, repeatMode)) {
            busy.value = true;
            void commit(direction, currentSong?.localId);
          }
        }}>
        <Animated.View style={[styles.row, { width: size * 3, height: size, left: -size }, slide]}>
          {[visible.previous, visible.current, visible.next].map((cover, index) => (
            <MediaImage key={`${index}:${imageVersion}`} cover={cover ?? { kind: 'none' }} size="detail" style={{ width: size, height: size }} />
          ))}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: onDark.surface },
  row: { flexDirection: 'row' },
});
