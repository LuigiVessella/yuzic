import React from 'react';
import { StyleSheet } from 'react-native';
import { Heart } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import Touchable from '@/components/Touchable';
import { controlSize, iconSize, onDark, spacing, statusColor } from '@/constants/design';
import type { Song } from '@/domain/entities/Song';
import { useStarSong } from '@/features/library/useStarSong';
import { useUnstarSong } from '@/features/library/useUnstarSong';
import { useStarredSongs } from '@/features/library/useStarredSongs';
import { toggleFavorite } from '@/features/entity-actions/shared/starActions';
import { useIsOffline } from '@/features/connectivity/useIsOffline';
import { selectActiveServer } from '@/state/redux/selectors/serversSelectors';

export default function PlayerFavoriteButton({ song }: { song: Song }) {
  const { t } = useTranslation();
  const server = useSelector(selectActiveServer);
  const offline = useIsOffline();
  const star = useStarSong();
  const unstar = useUnstarSong();
  const { songs } = useStarredSongs();
  const selected = songs.some(item => item.localId === song.localId);
  if (song.provenance.origin !== 'server' || song.provenance.serverId !== server?.id) return null;

  return <Touchable testID="playing-favorite" accessibilityRole="button"
    accessibilityLabel={t('a11y.player.favorite')}
    accessibilityState={{ selected, disabled: star.isPending || unstar.isPending }}
    disabled={star.isPending || unstar.isPending} feedback="control" style={styles.button}
    onPress={() => toggleFavorite({
      isStarred: selected, star: () => star.mutateAsync(song), unstar: () => unstar.mutateAsync(song.nativeId),
      t, title: song.title, close: () => {}, offlineAware: true, isOffline: offline,
      addedKey: 'songOptions.toasts.addedToFavorites', removedKey: 'songOptions.toasts.removedFromFavorites',
      addedOfflineKey: 'songOptions.toasts.addedToFavoritesOffline', removedOfflineKey: 'songOptions.toasts.removedFromFavoritesOffline',
      failedKey: 'songOptions.toasts.updateFavoritesFailed',
    })}>
    <Heart size={iconSize.large} color={selected ? statusColor.favorite : onDark.subtext}
      fill={selected ? statusColor.favorite : 'none'} />
  </Touchable>;
}
const styles = StyleSheet.create({
  button: { minWidth: controlSize.minimumTarget, minHeight: controlSize.minimumTarget,
    alignItems: 'center', justifyContent: 'center', padding: spacing.sm },
});
