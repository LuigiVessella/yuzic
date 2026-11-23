import React, { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { Text } from '@/components/Text'
import { FlashList } from '@shopify/flash-list'
import { useNavigation } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import { spacing, typography } from '@/constants/design'
import type { Artist } from '@/domain/entities/Artist'
import { useAlbums } from '@/features/album/useAlbums'
import { useArtists } from '@/features/artist/useArtists'
import { findArtistsWithSharedGenres } from '@/features/artist/localSimilarArtists'
import { mergeRelatedArtists, type RelatedArtist } from '@/features/artist/mergeRelatedArtists'
import { useServerSimilarArtists } from '@/features/artist/useServerSimilarArtists'
import MediaTile from '@/features/home/components/MediaTile'
import { useWindowLayout } from '@/features/layout/useWindowLayout'
import { useMatchedNavigation } from '@/features/sources/useMatchedNavigation'
import { useTheme } from '@/features/theme/useTheme'
import { useExternalSimilarArtistRows } from '@/providers/registry/artistSources'
import { SOURCES, type SourceId } from '@/providers/registry/sources'

function SimilarArtistsShelf({ data }: { data: RelatedArtist[] }) {
  const { t } = useTranslation()
  const { colors } = useTheme()
  const { width } = useWindowLayout()
  const navigation = useNavigation<any>()
  const { navigateToArtist } = useMatchedNavigation()
  const size = Math.min(132, Math.max(112, (width - 56) / 2.7))

  if (data.length === 0) return null

  return (
    <View style={styles.similarSection}>
      <Text style={[styles.sectionTitle, { color: colors.secondary }]}>
        {t('artist.sections.similarArtists')}
      </Text>
      <FlashList
        horizontal
        data={data}
        keyExtractor={({ artist }) => artist.localId}
        renderItem={({ item: { artist, source } }) => (
          <MediaTile
            cover={artist.cover}
            title={artist.name}
            subtitle={artist.provenance.origin === 'server'
              ? t('externalAlbum.menu.inLibrary')
              : source ? t(SOURCES[source].nameKey) : t('common.artist')}
            size={size}
            radius={size / 2}
            onPress={() => artist.provenance.origin === 'server'
              ? navigation.push('artistView', { id: artist.nativeId })
              : navigateToArtist(artist)}
          />
        )}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.similarListContent}
        ItemSeparatorComponent={() => <View style={styles.similarGap} />}
      />
    </View>
  )
}

export function LocalSimilarArtistsSection({ artist }: { artist: Artist }) {
  const { albums } = useAlbums()
  const { artists } = useArtists()
  const { data: serverSimilar } = useServerSimilarArtists(artist.nativeId, 12)
  const externalRows = useExternalSimilarArtistRows(artist)
  const data = useMemo(() => {
    const byId = new Map(artists.map(entry => [entry.localId, entry]))
    const local = findArtistsWithSharedGenres(artist.localId, albums)
      .flatMap(ref => {
        const entry = byId.get(ref.localId)
        return entry ? [{ artist: entry }] : []
      })
    return mergeRelatedArtists([
      ...local,
      ...(serverSimilar ?? []).map(entry => ({ artist: entry })),
      ...externalRows.flatMap(row => row.artists.map(entry => ({ artist: entry, source: row.id }))),
    ], artists, artist)
  }, [albums, artist, artists, externalRows, serverSimilar])

  return <SimilarArtistsShelf data={data} />
}

export function ExternalSimilarArtistsSection({ artist, similarArtists }: { artist: Artist; similarArtists: Artist[] }) {
  const { artists } = useArtists()
  const data = useMemo(() => mergeRelatedArtists(similarArtists.map(entry => ({
    artist: entry,
    source: entry.provenance.origin === 'integration' && entry.provenance.providerId in SOURCES
      ? entry.provenance.providerId as SourceId
      : undefined,
  })), artists, artist), [artist, artists, similarArtists])
  return <SimilarArtistsShelf data={data} />
}

const styles = StyleSheet.create({
  similarSection: {
    paddingTop: spacing.roomy,
    paddingBottom: spacing.controlGap,
  },
  sectionTitle: {
    ...typography.navigationTitle,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.controlGap,
  },
  similarListContent: {
    paddingHorizontal: spacing.lg,
  },
  similarGap: {
    width: spacing.sm,
  },
})
