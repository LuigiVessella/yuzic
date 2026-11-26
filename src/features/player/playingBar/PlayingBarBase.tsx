import { cappedTypography, fontScaleCap, hitSlopFor, iconSize, spacing } from '@/constants/design';
import React, { memo, useEffect, useMemo } from 'react';
import { InteractionManager, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from '@/components/Text';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Music, Play, Pause } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import PlaylistList from '@/components/PlaylistList';
import OutputDeviceSheet from '@/features/player/components/OutputDeviceSheet';
import { MediaImage } from '@/components/MediaImage';
import { usePlayingState, usePlayingActions } from '@/features/playback/PlayingContext';
import { hasDuration } from '@/domain/playback/ContentKind';
import Animated, {
  useSharedValue,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import {
  PLAYER_SPRING,
  usePlayerExpansion,
} from '@/features/player/PlayerExpansion';
import { settleFromBar } from '@/features/player/settle';
import { useTheme } from '@/features/theme/useTheme';
import { useRadius } from '@/features/theme/useRadius';
import { selectPlayingBarAction } from '@/features/settings/appearance/state';

import { usePlayingBarAction } from './actions/usePlayingBarAction';
import ProgressBarStrip from './ProgressBarStrip';
import { useSheetRef } from '@/components/useSheetRef';
import SpinningLoaderCircle from '@/components/SpinningLoaderCircle';
import Touchable from '@/components/Touchable';

const PLACEHOLDER_ICON_SIZE = 32;

/**
 * The now-playing row at the top of the tab dock. iOS and Android draw it the
 * same way; each platform's `PlayingBar` renders this.
 *
 * Memoised because of *where* it is mounted. It lives inside the tab bar, so
 * that it survives tab switches and pushes — which also means it is a child of
 * a component the navigator re-renders on every push and pop in any tab. It
 * takes no props, so without this the entire bar rebuilt each time somebody
 * opened an album.
 */
function PlayingBarBase() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const rad = useRadius();
  const themeColor = colors.themeColor;
  const actionMode = useSelector(selectPlayingBarAction);
  const { height } = useWindowDimensions();

  const { currentSong, isPlaying, isBuffering } = usePlayingState();
  const { pauseSong, resumeSong } = usePlayingActions();
  const { expansion, expand, prepare, interactionEpoch } = usePlayerExpansion();

  // Whether the drag below actually moved the player. A gesture that decided
  // nothing must not settle as though it decided something — see `settle.ts`.
  const dragMoved = useSharedValue(false);
  const gestureEpoch = useSharedValue(0);

  const playlistSheetRef = useSheetRef();
  const castSheetRef = useSheetRef();

  const primaryAction = usePlayingBarAction(actionMode, {
    presentAddToPlaylist: () => {
      if (currentSong) playlistSheetRef.current?.present();
    },
    presentCast: () => castSheetRef.current?.present(),
  });

  // Prepare after interactions; the thumbnail remains owned by this bar.
  const hasSong = currentSong != null;
  useEffect(() => {
    if (!hasSong) return;
    const task = InteractionManager.runAfterInteractions(() => prepare());
    return () => task.cancel();
  }, [hasSong, prepare]);

  const handlePlayPause = async () => {
    if (!currentSong) return;
    if (isPlaying) {
      await pauseSong();
    } else {
      await resumeSong();
    }
  };

  const handleExpand = () => {
    if (!currentSong) return;
    expand();
  };

  // Dragging the bar upward moves the player itself rather than starting an
  // animation and watching it play: `expansion` follows the finger, and only
  // the release is animated. `onBegin` builds the player screen at touch-down
  // so the tree is ready before the drag has travelled far enough to show it.
  const dragToOpen = useMemo(
    () =>
      Gesture.Pan()
        .enabled(currentSong != null)
        // A tap belongs to the pressable. This pan activates only after a
        // deliberate upward pull, and fails as soon as it becomes a downward
        // movement, so ordinary finger settling cannot cancel `onPress` and
        // make the player briefly rise then fall back into the dock.
        .activeOffsetY(-18)
        .failOffsetY(18)
        .failOffsetX([-24, 24])
        .onBegin(() => {
          dragMoved.value = false;
          gestureEpoch.value = interactionEpoch.value;
          runOnJS(prepare)();
        })
        .onUpdate(event => {
          if (gestureEpoch.value !== interactionEpoch.value) return;
          dragMoved.value = true;
          expansion.value = Math.min(1, Math.max(0, -event.translationY / height));
        })
        // `onFinalize` rather than `onEnd`, so a cancelled or interrupted drag
        // settles too. An exit that names no end is what leaves the bar faded
        // out with the music still playing (#211).
        .onFinalize(event => {
          if (gestureEpoch.value !== interactionEpoch.value) return;
          const target = settleFromBar(expansion.value, event.velocityY, dragMoved.value);
          // A tap: the pressable already started the spring it meant.
          if (target === null) return;
          expansion.value = withSpring(target, PLAYER_SPRING);
        }),
    [currentSong, dragMoved, expansion, height, prepare, gestureEpoch, interactionEpoch],
  );


  return (
    <>
      <GestureDetector gesture={dragToOpen}>
        <View>
          <Touchable
            accessibilityLabel={currentSong ? t('a11y.player.nowPlayingBar') : t('a11y.player.noSongPlaying')}
            accessibilityRole="button"
            testID={currentSong ? 'playing-bar' : 'playing-bar-empty'}
            onPressIn={prepare}
            onPress={handleExpand}
          >
            <View style={[styles.container, { backgroundColor: colors.card, borderRadius: rad.card }]}>
              <View style={styles.topRowWrapper}>
                <View style={styles.topRow}>
                  <Animated.View
                    style={[styles.coverArt, { borderRadius: rad.thumb } ]}
                  >
                    {currentSong?.cover ? (
                      <MediaImage
                        cover={currentSong.cover}
                        fallbackCover={currentSong.album.cover}
                        size="thumb"
                        style={styles.coverFill}
                      />
                    ) : (
                      <View style={[styles.coverFill, styles.iconPlaceholder]}>
                        <Music size={PLACEHOLDER_ICON_SIZE} color={colors.secondary} />
                      </View>
                    )}
                  </Animated.View>

                  <View style={styles.details}>
                    <Text
                      testID="playing-bar-title"
                      numberOfLines={1}
                      maxFontSizeMultiplier={fontScaleCap.control}
                      appScaling={false}
                      style={[styles.title, { color: colors.secondary }]}
                    >
                      {currentSong?.title || t('playing.bar.noSong')}
                    </Text>
                    <Text
                      numberOfLines={1}
                      maxFontSizeMultiplier={fontScaleCap.control}
                      appScaling={false}
                      style={[styles.artist, { color: colors.subtext }]}
                    >
                      {currentSong?.artist.name || t('playing.bar.selectTrack')}
                    </Text>
                  </View>

                  {currentSong && (
                    <Touchable
                      accessibilityLabel={isPlaying ? t('a11y.player.pause') : t('a11y.player.play')}
                      accessibilityRole="button"
                      testID="playing-bar-play-pause"
                      style={styles.playPauseButton}
                      onPress={event => { event.stopPropagation(); void handlePlayPause(); }}
                      hitSlop={hitSlopFor(iconSize.control)}
                    >
                      {isBuffering
                        ? <SpinningLoaderCircle size={iconSize.control} color={colors.secondary} />
                        : isPlaying
                          ? <Pause size={iconSize.header} color={colors.secondary} fill={colors.secondary} />
                          : <Play size={iconSize.header} color={colors.secondary} fill={colors.secondary} />
                      }
                    </Touchable>
                  )}

                  {/* A filled accent disc here made the contextual action the loudest
                      thing in the dock while play/pause was a bare glyph beside it. Both
                      are plain now, separated by size and colour instead. */}
                  {primaryAction && (
                    <Touchable
                      accessibilityRole="button"
                      accessibilityLabel={primaryAction.label}
                      accessibilityState={primaryAction.selected === undefined
                        ? undefined
                        : { selected: primaryAction.selected }}
                      style={styles.actionButton}
                      onPress={event => { event.stopPropagation(); primaryAction.onPress(); }}
                      hitSlop={hitSlopFor(iconSize.control)}
                    >
                      {primaryAction.icon}
                    </Touchable>
                  )}
                </View>
              </View>

              {/* A radio station has no meaningful position to draw — hide the strip
               * entirely rather than let it sit flat at zero. Podcast episodes keep it. */}
              {(!currentSong || hasDuration(currentSong.contentKind)) && (
                <ProgressBarStrip
                  fallbackDuration={currentSong?.durationSeconds || 1}
                  fillColor={themeColor}
                  trackColor={colors.border}
                />
              )}
            </View>
          </Touchable>
        </View>
      </GestureDetector>

      <PlaylistList
        ref={playlistSheetRef}
        selectedSong={currentSong}
        onClose={() => playlistSheetRef.current?.dismiss()}
      />

      <OutputDeviceSheet ref={castSheetRef} />
    </>
  );
}

const styles = StyleSheet.create({
  // An inset surface inside the existing dock; expansion and gestures still
  // measure the same artwork view.
  container: {
    flexDirection: 'column',
    marginHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    overflow: 'hidden',
    // Equal above the row and below it. Tighter than the gap around the
    // 40pt cover was: the art grows into this padding rather than pushing
    // the row taller, so the cover gains prominence and the bar does not
    // gain height.
    paddingTop: spacing.sm,
    paddingBottom: 0,
    paddingHorizontal: spacing.sm,
  },
  topRowWrapper: {
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // The artwork sets the row height rather than sitting inside it with
    // slack, so the cover can grow without the dock growing with it.
    minHeight: 48,
  },
  coverArt: {
    width: 48,
    height: 48,
    marginRight: spacing.md,
    // The artwork fills this slot now rather than being it, so the slot has to
    // do the clipping — it is what the player measures and hands over.
    overflow: 'hidden',
  },
  coverFill: {
    width: '100%',
    height: '100%',
  },
  details: {
    flex: 1,
  },
  // The title was `caption` like the artist under it, so the two read as
  // one block of small text with no hierarchy. It is the loudest thing in
  // the row now, with the artist staying quiet beneath.
  title: {
    ...cappedTypography.control.compactRowTitle,
    fontWeight: '500',
  },
  artist: {
    ...cappedTypography.control.caption,
    marginTop: spacing.xxs,
  },
  iconPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  playPauseButton: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.roomy,
  },
  actionButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default memo(PlayingBarBase);
