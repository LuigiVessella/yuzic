import { useQuery } from '@tanstack/react-query'
import { QueryKeys } from '@/state/query/queryKeys'
import { ALL_SOURCES } from '@/features/sources/registry'
import type { Song } from '@/domain/entities/Song'
import type { Artist } from '@/domain/entities/Artist'

type Input = {
  name: string
  mbid?: string | null
  catalogueId?: string
  enabled: boolean
}

type Result = {
  topTracks: Song[]
  similarArtists: Artist[]
  isLoading: boolean
}

export function useArtistTopTracks({ name, mbid, catalogueId, enabled }: Input): Result {
  const query = useQuery({
    queryKey: [QueryKeys.LocalArtistTopTracks, catalogueId ?? name, mbid],
    enabled: enabled && !!name,
    staleTime: 1000 * 60 * 60 * 24,
    networkMode: 'online',
    queryFn: async () => {
      const source = ALL_SOURCES[0]
      const id = catalogueId ?? (await source.resolveArtist(name))?.id
      return id ? source.fetchArtist(id, mbid) : null
    },
  })

  return {
    topTracks: query.data?.topTracks ?? [],
    similarArtists: query.data?.similarArtists ?? [],
    isLoading: query.isLoading,
  }
}
