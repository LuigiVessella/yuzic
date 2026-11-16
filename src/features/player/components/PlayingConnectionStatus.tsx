import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '@/components/Text';
import Touchable from '@/components/Touchable';
import { controlSize, onDark, spacing, typography } from '@/constants/design';
import { connectivityBanner } from '@/features/connectivity/connectivityBanner';
import { useIsOffline } from '@/features/connectivity/useIsOffline';
import { useServerReachable } from '@/features/connectivity/useServerReachable';

/** Read the shared reachability signal; never start a second probe or poll. */
export default function PlayingConnectionStatus({ onDownloads }: { onDownloads: () => void }) {
  const { t } = useTranslation();
  const isOffline = useIsOffline();
  const serverReachable = useServerReachable();
  const banner = connectivityBanner({ isOffline, serverReachable });
  if (!banner) return null;

  return (
    <View style={styles.container} testID="playing-connection-status">
      <Text accessibilityLiveRegion="polite" style={styles.message}>
        {t(banner === 'offline' ? 'playing.connection.offline' : 'playing.connection.serverUnreachable')}
      </Text>
      <Touchable accessibilityRole="button" onPress={onDownloads} style={styles.action}>
        <Text style={styles.link}>{t('home.filters.downloaded')}</Text>
      </Touchable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', paddingHorizontal: spacing.lg },
  message: { ...typography.caption, color: onDark.subtext, textAlign: 'center' },
  action: { padding: spacing.md, minHeight: controlSize.minimumTarget, justifyContent: 'center' },
  link: { ...typography.rowSubtitle, color: onDark.text },
});
