import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Cast, ListMusic, AlignLeft } from 'lucide-react-native';
import { Text } from '@/components/Text';
import { usePlaybackSink } from '@/features/player/PlaybackSinkContext';
import Touchable from '@/components/Touchable';
import { controlSize, iconSize, onDark, spacing, typography } from '@/constants/design';
import { useRadius } from '@/features/theme/useRadius';

type Props = {
  mode: 'player' | 'queue';
  setMode: (mode: 'player' | 'queue') => void;
  onOpenOutputSheet: () => void;
  onOpenLyrics?: () => void;
};

/** Named destinations with stable targets, separate from playback controls. */
export default function BottomControls({ mode, setMode, onOpenOutputSheet, onOpenLyrics }: Props) {
  const { t } = useTranslation();
  const { sink } = usePlaybackSink();
  const rad = useRadius();
  const items = [
    ...(onOpenLyrics ? [{ id: 'lyrics', label: t('playing.lyrics.title'), icon: AlignLeft, active: false, press: onOpenLyrics }] : []),
    { id: 'queue', label: t('playing.queue.title'), icon: ListMusic, active: mode === 'queue', press: () => setMode(mode === 'queue' ? 'player' : 'queue') },
    { id: 'output', label: sink.kind === 'local' ? t('playing.output.title') : sink.name, icon: Cast, active: sink.kind !== 'local', press: onOpenOutputSheet },
  ];
  return <View style={styles.container}>
    {items.map(item => <Touchable key={item.id} testID={`playing-${item.id}-toggle`}
      accessibilityRole="button" accessibilityState={{ selected: item.active }} onPress={item.press}
      style={[styles.button, { borderRadius: rad.md }]}>
      <item.icon size={iconSize.control} color={item.active ? onDark.text : onDark.subtext} />
      <Text numberOfLines={2} style={[styles.label, { color: item.active ? onDark.text : onDark.subtext }]}>{item.label}</Text>
    </Touchable>)}
  </View>;
}
const styles = StyleSheet.create({
  container: { width: '100%', flexDirection: 'row', justifyContent: 'space-evenly', gap: spacing.sm },
  button: { flex: 1, minHeight: controlSize.minimumTarget, paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  label: { ...typography.caption, textAlign: 'center' },
});
