import { onDark, spacing, typography } from '@/constants/design';
import React, { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/Text';
import { usePlayingState } from '@/features/playback/PlayingContext';
import { useSelector } from 'react-redux';
import { selectShowQualityBadge } from '@/features/settings/appearance/state';
import { hasDuration } from '@/domain/playback/ContentKind';
import Touchable from '@/components/Touchable';
import { useRadius } from '@/features/theme/useRadius';
import PlayingProgressSection from './PlayingProgress';
import PlayingRating from './PlayingRating';
import PlayerArtwork from './PlayerArtwork';
import PlayerFavoriteButton from './PlayerFavoriteButton';
import type { PlayerLayout } from '../playerLayout';

type PlayingMainProps = {
  /**
   * Where the artwork and the column beside it go — see `playerLayout`.
   * Everything this component sizes comes from here rather than from the
   * window, so the one screen that decides the shape is the one that knows
   * what is above and below it.
   */
  layout: PlayerLayout;
  onPressArtist?: () => void;
  /**
   * The transport row, handed in rather than rendered here.
   *
   * It belongs under the title in both shapes, and in the split one "under
   * the title" is inside the right-hand column — so the column has to own it.
   * The alternative was for the screen to place it and for the two of them to
   * agree about the column's width twice.
   */
  children?: ReactNode;
};

const PlayingMain: React.FC<PlayingMainProps> = ({
  layout,
  onPressArtist,
  children
}) => {
  const { t } = useTranslation();
  const { coverSize, columnWidth, rowWidth, columnGap } = layout;
  const split = layout.mode === 'split';
  const inline = layout.inline;
  const { currentSong } = usePlayingState();
  const rad = useRadius();
  const coverCorner = layout.bleed ? 0 : rad.card;
  const showQualityBadge = useSelector(selectShowQualityBadge);

  if (!currentSong) {
    return null;
  }
  const qualityLabel = (() => {
    const parts: string[] = [];
    const audio = currentSong.audio;
    if (audio?.mimeType) {
      const fmt = audio.mimeType.split('/')[1]?.toUpperCase().replace('MPEG', 'MP3').replace('X-FLAC', 'FLAC') ?? '';
      if (fmt) parts.push(fmt);
    }
    if (audio?.bitrateKbps) parts.push(`${audio.bitrateKbps}kbps`);
    else if (audio?.sampleRateHz) parts.push(`${(audio.sampleRateHz / 1000).toFixed(1)}kHz`);
    return parts.join(' · ') || null;
  })();

  const cover = (
    <View style={[split || inline ? styles.coverBeside : styles.coverAbove, inline && styles.coverInline]}>
      <PlayerArtwork size={coverSize} corner={coverCorner} />
    </View>
  );

  const details = (
    <View style={{ width: columnWidth }}>
      <View style={[styles.titleRow, inline && styles.titleRowInline]}>
        {inline && cover}
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={2}>
            {currentSong.title}
          </Text>

          {currentSong.artist.name && (
            <Touchable
              accessibilityRole="link"
              accessibilityHint={t('a11y.player.goToArtist')}
              onPress={onPressArtist}
            >
              <Text style={styles.artist} numberOfLines={1}>
                {currentSong.artist.name}
              </Text>
            </Touchable>
          )}
        </View>

        <PlayerFavoriteButton song={currentSong} />
      </View>

      <PlayingRating song={currentSong} />

      {showQualityBadge && qualityLabel && (
        <Text style={styles.qualityBadge} numberOfLines={1}>
          {qualityLabel}
        </Text>
      )}

      {/* Progress + timestamps only make sense for a finite piece of audio.
       * A radio station's position is meaningless, and the "-0:00 remaining"
       * label under an infinite stream reads as broken. */}
      {hasDuration(currentSong.contentKind) && (
        <PlayingProgressSection songDuration={currentSong.durationSeconds} />
      )}

      {children}
    </View>
  );

  // Two shapes of the same four things. The row is centred on the taller of
  // its two halves rather than stretched: in a short window the column is
  // what sets the height, and a cover stretched to match it would no longer
  // be square.
  // Compact: the cover is already inside the title row, so the column is all.
  if (inline) {
    return <View style={[styles.root, { width: rowWidth }]}>{details}</View>;
  }

  return split ? (
    <View style={[styles.splitRoot, { width: rowWidth, columnGap }]}>
      {cover}
      {details}
    </View>
  ) : (
    <View style={[styles.root, { width: rowWidth }]}>
      {cover}
      {details}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    alignSelf: 'center',
  },
  splitRoot: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
  },
  coverAbove: {
    marginBottom: spacing.lg,
    // Centred in the column: the compact player's cover is narrower than it.
    alignSelf: 'center',
  },
  coverBeside: {
    marginBottom: 0,
  },
  // Beside the title, with the title's own gap to its right.
  coverInline: {
    marginRight: spacing.lg,
  },
  titleRowInline: {
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  textContainer: {
    flex: 1,
    paddingRight: spacing.md,
  },
  title: {
    ...typography.sectionTitle,
    color: onDark.text,
    marginBottom: spacing.xs,
  },
  artist: {
    ...typography.rowSubtitle,
    color: onDark.subtext,
  },
  qualityBadge: {
    ...typography.micro,
    color: onDark.mutedText,
    textAlign: 'left',
    marginBottom: spacing.sm,
    letterSpacing: 0.3,
  },
});

export default PlayingMain;
