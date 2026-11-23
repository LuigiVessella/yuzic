import type { Artist } from '@/domain/entities/Artist'
import { makeLocalId } from '@/domain/identity/LocalId'
import { integrationProvenance, serverProvenance, type Provenance } from '@/domain/identity/Provenance'
import { mergeRelatedArtists } from './mergeRelatedArtists'

function artist(name: string, nativeId: string, provenance: Provenance, externalIds: Artist['externalIds'] = {}): Artist {
  return {
    name, nativeId, provenance, externalIds, localId: makeLocalId('artist', provenance, nativeId),
    cover: { kind: 'none' }, tags: [], albumIds: [],
  }
}

const server = serverProvenance('jellyfin')
const deezer = integrationProvenance('deezer')
const lastfm = integrationProvenance('lastfm')

it('joins related artists across sources and opens the library identity when it exists', () => {
  const seed = artist('Guè', '1', server, { mbid: 'gue' })
  const fibra = artist('Fabri Fibra', '2', server, { mbid: 'fibra' })
  const catalogueFibra = artist('Fabri Fibra', '3', deezer)
  const external = artist('Another artist', '5', deezer, { mbid: 'another' })
  expect(mergeRelatedArtists([
    { artist: artist('Guè', '4', deezer, { mbid: 'gue' }) },
    { artist: catalogueFibra, source: 'deezer' },
    { artist: fibra },
    { artist: external, source: 'deezer' },
    { artist: artist('Another artist', '6', lastfm, { mbid: 'another' }), source: 'lastfm' },
  ], [seed, fibra], seed)).toEqual([
    { artist: fibra, source: 'deezer' },
    { artist: external, source: 'deezer' },
  ])
})

it('keeps separate profiles when the same display name has different identities', () => {
  const seed = artist('Guè', '1', server)
  const local = artist('Gemitaiz', '2', server, { deezerId: '3' })
  const known = artist('Gemitaiz', '3', deezer, { deezerId: '3' })
  const other = artist('Gemitaiz', '4', deezer, { deezerId: '4' })
  const result = mergeRelatedArtists([{ artist: known }, { artist: other }], [local], seed)
  expect(result.map(entry => entry.artist)).toEqual([local, other])
})

it('does not choose arbitrarily between two same-name library artists', () => {
  const seed = artist('Guè', '1', server)
  const result = artist('Gemitaiz', '4', deezer)
  const homonyms = [artist('Gemitaiz', '2', server), artist('Gemitaiz', '3', server)]
  expect(mergeRelatedArtists([{ artist: result }], homonyms, seed)).toEqual([{ artist: result }])
})
