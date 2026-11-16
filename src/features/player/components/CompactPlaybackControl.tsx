import React from 'react';
import { StyleSheet } from 'react-native';
import { Pause, Play } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { usePlayingActions, usePlayingState } from '@/features/playback/PlayingContext';
import { useTheme } from '@/features/theme/useTheme';
import Touchable from '@/components/Touchable';
import SpinningLoaderCircle from '@/components/SpinningLoaderCircle';
import { controlSize, iconSize, spacing } from '@/constants/design';

/** Transport for a sheet, reading the same session as the full player. */
export default function CompactPlaybackControl() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { isPlaying, isBuffering } = usePlayingState();
  const { pauseSong, resumeSong } = usePlayingActions();
  return <Touchable accessibilityRole="button" feedback="control" style={styles.button}
    accessibilityLabel={t(isPlaying ? 'a11y.player.pause' : 'a11y.player.play')}
    onPress={isPlaying ? pauseSong : resumeSong}>
    {isBuffering ? <SpinningLoaderCircle size={iconSize.control} color={colors.secondary} />
      : isPlaying ? <Pause size={iconSize.control} color={colors.secondary} />
        : <Play size={iconSize.control} color={colors.secondary} />}
  </Touchable>;
}
const styles = StyleSheet.create({
  button: { minWidth: controlSize.minimumTarget, minHeight: controlSize.minimumTarget,
    alignItems: 'center', justifyContent: 'center', padding: spacing.sm },
});
