import React, { useCallback, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';

import { fetchMadeForYouMixes, LISTENERS_HOME_USE, selectListenersAccountName, type CreatedForMixType } from '@/providers/registry/homeDiscovery';
import { useLocalFirst } from '@/features/library/useLocalFirst';
import { useSongActionSheets } from '@/features/entity-actions/SongActionSheetContext';
import { QueryKeys } from '@/state/query/queryKeys';
import { selectSourceUse } from '@/features/settings/sources/state';
import SectionShelfHeader from './SectionShelfHeader';
import SongRow from '@/components/rows/SongRow';
import SkeletonListRow from '@/components/SkeletonListRow';
import { useSourceSectionPresence } from './SourceGroup';
import { usePlayingActions } from '@/features/playback/PlayingContext';
import { notify } from '@/components/toast';
import { spacing } from '@/constants/design';
import { SECTION_H_PADDING as H_PADDING } from '@/features/home/constants';
import type { Song } from '@/domain/entities/Song';

type Props = {
  /** This shelf's key in the home layout, so the source group above it knows
   * which of its sections has just gone quiet. */
  sectionKey: string;
  mixType: CreatedForMixType;
  refreshKey?: number;
};

const TITLE_KEYS: Record<CreatedForMixType, string> = {
  'daily-jams': 'explore.sections.lbCreatedFor.dailyJams',
  'weekly-jams': 'explore.sections.lbCreatedFor.weeklyJams',
  'weekly-exploration': 'explore.sections.lbCreatedFor.weeklyExploration',
};

const MAX_TRACKS = 10;

/**
 * One of ListenBrainz's periodic "created for you" mixes — Daily Jams,
 * Weekly Jams, Weekly Exploration — as its own standalone shelf. LB built
 * the mix; this only fetches and renders it, the same as every other
 * external Home row, so there is no local mix-generator here.
 *
 * Rides the same setting as the similar-artists shelf (`listenbrainzDiscoveryEnabled`)
 * rather than a setting of its own, plus a configured LB username — without
 * one there's nobody to fetch createdfor playlists for. Off by default like
 * every external discovery source.
 *
 * Tracks that aren't in the local library render through the shared
 * `SongRow`, which already gives an unowned/external track Want/Get for
 * free — nothing mix-specific is needed here for that.
 */
export default function LBCreatedForSection({ sectionKey, mixType, refreshKey = 0 }: Props) {
  const { t } = useTranslation();
  const { playSongs } = usePlayingActions();
  const { preferLocalSong } = useLocalFirst();
  const { openSongOptions } = useSongActionSheets();
  const discoveryEnabled = useSelector(selectSourceUse(LISTENERS_HOME_USE));
  const username = useSelector(selectListenersAccountName);

  const enabled = discoveryEnabled && Boolean(username);

  const query = useQuery({
    queryKey: [QueryKeys.LbCreatedForPlaylists, username || '', refreshKey],
    queryFn: () => fetchMadeForYouMixes(username),
    select: mixes => mixes.find(mix => mix.mixType === mixType)?.tracks ?? [],
    enabled,
    staleTime: 1000 * 60 * 60 * 6,
    networkMode: 'online',
  });

  const data = useMemo(() => (query.data ?? []).slice(0, MAX_TRACKS).map(preferLocalSong), [query.data, preferLocalSong]);
  const playable = useMemo(() => data.filter(song => song.provenance.origin === 'server'), [data]);
  const isLoading = enabled && query.isLoading;
  const hasContent = isLoading || data.length > 0;

  useSourceSectionPresence(sectionKey, hasContent);

  /** A tapped row plays this mix from there. Without `onPress` the row has
   *  neither a handler nor a collection, which is what `SongRow` disables
   *  itself on — the same defect as the local mix's (#264). */
  const playFrom = useCallback(async (startIndex: number) => {
    const song = data[startIndex];
    if (!song) return;
    if (song.provenance.origin !== 'server') {
      openSongOptions(song);
      return;
    }
    try {
      await playSongs(playable, { startIndex: playable.indexOf(song), contextId: `lb-created-for-${mixType}` });
    } catch {
      notify.error(t('library.collection.playFailed'));
    }
  }, [playSongs, data, playable, openSongOptions, mixType, t]);

  const renderSong = useCallback((song: Song, index: number) => (
    <SongRow
      key={song.localId}
      song={song}
      onPress={() => { void playFrom(index); }}
    />
  ), [playFrom]);

  // A heading over an empty rail is worse than no shelf — and the source
  // header above it goes with it, told by the presence report.
  if (!hasContent) return null;

  return (
    <View style={styles.container}>
      <SectionShelfHeader title={t(TITLE_KEYS[mixType])} />
      {isLoading ? (
        <View style={styles.loader}>
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonListRow key={`lb-created-for-loading-${index}`} />
          ))}
        </View>
      ) : (
        data.map(renderSong)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: spacing.md, paddingBottom: spacing.sm },
  loader: { paddingHorizontal: H_PADDING },
});
