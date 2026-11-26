import React, { useMemo, useRef } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Text } from '@/components/Text';
import { Ellipsis } from 'lucide-react-native';
import { notify } from '@/components/toast';
import { useSelector } from 'react-redux';
import { selectHomeShelfItemCount } from '@/features/settings/home/state';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/features/theme/useTheme';
import { useIconSize } from '@/features/theme/useIconSize';
import { usePlayingActions } from '@/features/playback/PlayingContext';
import { usePlayableSongResolver } from '@/features/song/usePlayableSongResolver';
import { useSongActionSheets } from '@/features/entity-actions/SongActionSheetContext';
import IconActionButton from '@/components/IconActionButton';
import { MediaImage } from '@/components/MediaImage';
import Touchable from '@/components/Touchable';
import { useRadius } from '@/features/theme/useRadius';
import { useListDensity } from '@/features/theme/useListDensity';
import { useWindowLayout } from '@/features/layout/useWindowLayout';
import {
  selectSongPlayCounts,
  selectSongLastPlayedAt,
} from '@/state/redux/selectors/statsSelectors';
import { useAlbumsById } from '@/features/album/useAlbumsById';
import { useSongsById } from '@/features/song/useSongsById';
import { seededShuffle } from '@/features/home/hooks/useDailyLayout';
import { useStableList } from '@/features/home/hooks/useStableList';
import type { Song } from '@/domain/entities/Song';
import {
  QUICK_PICKS_PAGE_SIZE,
  QUICK_PICKS_CANDIDATE_POOL,
  QUICK_PICKS_DECAY_MS,
  QUICK_PICKS_PEEK,
  SECTION_H_PADDING,
} from '@/features/home/constants';
import { contentWidth, spacing, typography } from '@/constants/design';

function useQuickPicks(refreshKey: number, itemCount: number): Song[] {
  const songsById = useSongsById();
  const playCounts = useSelector(selectSongPlayCounts);
  const lastPlayedAt = useSelector(selectSongLastPlayedAt);

  return useMemo(() => {
    const now = Date.now();
    const scored: { song: Song; score: number }[] = [];

    // Only iterate songs that actually have stats — avoids scanning the full 9000-song
    // library on every play count change (O(played) instead of O(library)).
    const idsWithStats = new Set([...Object.keys(playCounts), ...Object.keys(lastPlayedAt)]);

    for (const id of idsWithStats) {
      const song = songsById.get(id);
      if (!song) continue;
      const count = playCounts[id] ?? 0;
      const ts = lastPlayedAt[id] ?? 0;
      const recency = ts > 0 ? Math.exp(-(now - ts) / QUICK_PICKS_DECAY_MS) : 0;
      const freq = count > 0 ? Math.min(1, Math.log(count + 1) / Math.log(50)) : 0;
      scored.push({ song, score: recency * 0.8 + freq * 0.2 });
    }

    scored.sort((a, b) => b.score - a.score);
    const pool = scored.slice(0, QUICK_PICKS_CANDIDATE_POOL).map(s => s.song);
    if (refreshKey === 0) return pool.slice(0, itemCount);
    return seededShuffle(pool, (Math.imul(refreshKey, 1664525) + 1013904223) | 0).slice(0, itemCount);
  }, [songsById, playCounts, lastPlayedAt, refreshKey, itemCount]);
}

type Props = { refreshKey?: number };

export default function QuickPicksSection({ refreshKey = 0 }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const rad = useRadius();
  const density = useListDensity();
  const icons = useIconSize();
  const albums = useAlbumsById();
  const { playSong } = usePlayingActions();
  const { resolvePlayableSong } = usePlayableSongResolver();
  const itemCount = useSelector(selectHomeShelfItemCount);
  // Stable while the picks are unchanged; see `useStableList`.
  const picks = useStableList(useQuickPicks(refreshKey, itemCount));
  const { width: screenWidth } = useWindowLayout();
  // Keep the existing four-pick pages and peek. Tiles use two columns when
  // there is room, with a single column in narrow windows.
  const pageWidth = Math.min(screenWidth - QUICK_PICKS_PEEK, contentWidth.readable);
  const columns = pageWidth >= 340 ? 2 : 1;
  const { openSongOptions } = useSongActionSheets();

  const inFlightRef = useRef<string | null>(null);

  // Resolved by the origin's own id: the resolver looks the track up fresh
  // rather than trusting whatever fields this screen happens to hold.
  const handlePress = async (song: Song) => {
    if (inFlightRef.current === song.nativeId) return;
    inFlightRef.current = song.nativeId;
    try {
      const playable = await resolvePlayableSong(song.nativeId);
      if (playable) await playSong(playable.song);
      else notify.error(t('common.playbackError'));
    } finally {
      inFlightRef.current = null;
    }
  };

  const handleOptions = async (song: Song) => {
    const resolved = await resolvePlayableSong(song.nativeId, { allowNetwork: false });
    openSongOptions(resolved?.song ?? song);
  };

  const pages = useMemo(() => {
    const result: Song[][] = [];
    for (let i = 0; i < picks.length; i += QUICK_PICKS_PAGE_SIZE) {
      result.push(picks.slice(i, i + QUICK_PICKS_PAGE_SIZE));
    }
    return result;
  }, [picks]);

  // Hide the whole section until there's something to show, rather than leading
  // Home with an empty placeholder. It reappears once the user has play history.
  if (pages.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.secondary }]}>
        {t('explore.sections.quickPicks')}
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={pageWidth}
        snapToAlignment="start"
      >
        {pages.map((page, pageIdx) => (
          <View key={pageIdx} style={[styles.page, { width: pageWidth }]}>
            {page.map(song => (
              <View key={song.localId} style={[
                styles.pick,
                { width: (pageWidth - SECTION_H_PADDING * 2 - spacing.sm * (columns - 1)) / columns,
                  backgroundColor: colors.card, borderRadius: rad.card,
                  paddingVertical: density.rowPadding },
              ]}>
                <Touchable
                  style={styles.pickContent}
                  accessibilityRole="button"
                  accessibilityLabel={t('a11y.rows.titleAndSubtitle', { title: song.title, subtitle: song.artist.name })}
                  onPress={() => { void handlePress(song); }}
                >
                  <MediaImage cover={song.cover}
                    fallbackCover={albums.get(song.album.nativeId)?.cover ?? song.album.cover}
                    size="thumb" style={[styles.art, { borderRadius: rad.thumb }]} />
                  <View style={styles.pickText}>
                    <Text numberOfLines={2} style={[styles.pickTitle, { color: colors.secondary }]}>{song.title}</Text>
                    <Text numberOfLines={1} style={[styles.pickSubtitle, { color: colors.subtext }]}>{song.artist.name}</Text>
                  </View>
                </Touchable>
                  <IconActionButton
                    icon={<Ellipsis size={icons.row} color={colors.secondary} />}
                    onPress={() => { void handleOptions(song); }}
                    accessibilityLabel={t('a11y.rows.options', { title: song.title })}
                    size="compact"
                  />
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  title: {
    ...typography.sectionTitle,
    marginBottom: spacing.sm,
    paddingHorizontal: SECTION_H_PADDING,
  },
  page: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: SECTION_H_PADDING,
  },
  pick: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.sm, overflow: 'hidden' },
  pickContent: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  art: { width: 40, height: 40 },
  pickText: { flex: 1, minWidth: 0 },
  pickTitle: { ...typography.compactRowTitle, fontWeight: '500' },
  pickSubtitle: { ...typography.caption, marginTop: spacing.xxs },
});
