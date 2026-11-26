import type { BrowseCategory, BrowseItem } from '@/features/player/browse';

/**
 * What the car shows, decided in one pure function.
 *
 * `useCarPlayBrowseTree` gathers the library and turns songs into playable
 * rows; this decides the shape. Kept apart so the shape can be tested without
 * a query client, a server or a car, which is the part worth pinning: which
 * tabs appear, in what order, and what a folder holds.
 *
 * The shape follows what both cars do well and what a driver can use:
 *
 * - **At most four tabs.** CarPlay and Android Auto both draw the top level as
 *   tabs and both stop at four.
 * - **Recent first**, because what you were just listening to is what you most
 *   likely want back in the car. It is the Home shelf, not the library.
 * - **Offline, only what is on the device.** Downloads becomes the first tab,
 *   and every other tab keeps only its downloaded tracks, so nothing the car
 *   offers fails when tapped. Android reserves a tab for Downloads; CarPlay
 *   shows it when there is room.
 * - **Every folder starts with Shuffle** when it has more than one track. A
 *   driver cannot build a shuffled queue by hand while moving.
 * - **Covers draw as a grid** on Android Auto; tracks as a list.
 * - **Empty folders and empty tabs are left out**, so nothing in the car is a
 *   dead end.
 */

/** An album or a playlist, with its tracks already turned into rows. */
export interface CarCollection {
  kind: 'album' | 'playlist';
  /** The origin's own id. */
  id: string;
  title: string;
  subtitle?: string;
  artistId?: string;
  artworkUrl?: string;
  artworkHeaders?: Record<string, string>;
  tracks: BrowseItem[];
}

export interface CarLibrary {
  /** Most recently played first. */
  recent: CarCollection[];
  favorites: BrowseItem[];
  playlists: CarCollection[];
  albums: CarCollection[];
  downloads: BrowseItem[];
}

/** Translated by the caller; the car shows these words as they are. */
interface CarLabels {
  recent: string;
  favorites: string;
  playlists: string;
  albums: string;
  downloads: string;
  shuffle: string;
  library: string;
  artists: string;
}

const MAX_TABS = 4;

export function buildCarBrowseTree(
  library: CarLibrary,
  labels: CarLabels,
  { offline, android = false }: { offline: boolean; android?: boolean }
): BrowseCategory[] {
  const playable = (rows: BrowseItem[]): BrowseItem[] =>
    offline ? rows.filter(row => row.url?.startsWith('file:')) : rows;

  const shuffleRow = (): BrowseItem => ({ mediaId: 'shuffle', title: labels.shuffle, action: 'shuffle' });

  /** A folder's rows: Shuffle first when there is anything to shuffle. */
  const withShuffle = (rows: BrowseItem[]): BrowseItem[] => {
    const tracks = playable(rows);
    return tracks.length > 1 ? [shuffleRow(), ...tracks] : tracks;
  };

  const folder = (collection: CarCollection): BrowseItem | null => {
    if (!playable(collection.tracks).length) return null;
    return {
      mediaId: `${collection.kind}-${collection.id}`,
      title: collection.title,
      artist: collection.subtitle,
      artworkUrl: collection.artworkUrl ?? collection.tracks.find(track => track.artworkUrl)?.artworkUrl,
      artworkHeaders: collection.artworkUrl
        ? collection.artworkHeaders
        : collection.tracks.find(track => track.artworkUrl)?.artworkHeaders,
      children: withShuffle(collection.tracks),
      ...(android ? { layout: 'list' as const } : {}),
    };
  };

  const folders = (collections: CarCollection[]) =>
    collections.map(folder).filter((item): item is BrowseItem => item !== null);

  const recent: BrowseCategory = {
    mediaId: 'recent', title: labels.recent, icon: 'recent', layout: 'grid', items: folders(library.recent),
  };
  const favorites: BrowseCategory = {
    mediaId: 'favorites', title: labels.favorites, icon: 'favorites', layout: 'list',
    items: withShuffle(library.favorites),
  };
  const playlists: BrowseCategory = {
    mediaId: 'playlists', title: labels.playlists, icon: 'playlists', layout: 'grid', items: folders(library.playlists),
  };
  const albums: BrowseCategory = {
    mediaId: 'albums', title: labels.albums, icon: 'albums', layout: 'grid', items: folders(library.albums),
  };
  const downloads: BrowseCategory = {
    mediaId: 'downloads', title: labels.downloads, icon: 'downloads', layout: 'list',
    items: withShuffle(library.downloads),
  };

  if (android) {
    const sorted = (items: BrowseItem[]) => [...items].sort((a, b) => a.title.localeCompare(b.title));
    // Group collections, never tracks: selecting a track must still queue
    // the whole album/playlist rather than one alphabetic bucket.
    const grouped = (items: BrowseItem[]): BrowseItem[] => {
      if (items.length <= 60) return sorted(items);
      const groups = new Map<string, BrowseItem[]>();
      for (const item of sorted(items)) {
        const initial = item.title.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').charAt(0).toUpperCase() || '#';
        groups.set(initial, [...(groups.get(initial) ?? []), item]);
      }
      return [...groups].map(([initial, children]) => ({ mediaId: `group-${initial}`, title: initial, layout: 'grid', children }));
    };
    const artists = new Map<string, BrowseItem>();
    for (const album of library.albums) {
      const child = folder(album);
      if (!child) continue;
      const key = album.artistId ?? album.subtitle ?? album.id;
      const artist = artists.get(key);
      if (artist) artist.children!.push(child);
      else artists.set(key, {
        mediaId: `artist-${key}`, title: album.subtitle || album.title,
        artworkUrl: child.artworkUrl, artworkHeaders: child.artworkHeaders, layout: 'grid', children: [child],
      });
    }
    const collections: BrowseItem[] = [
      { mediaId: 'artists', title: labels.artists, layout: 'grid' as const, children: grouped([...artists.values()]) },
      { mediaId: 'albums', title: labels.albums, layout: 'grid' as const, children: grouped(albums.items) },
      { mediaId: 'playlists', title: labels.playlists, layout: 'grid' as const, children: grouped(playlists.items) },
    ].filter(item => item.children.length > 0);
    const all: BrowseCategory = {
      mediaId: 'library', title: labels.library, icon: 'library', layout: 'list', items: collections,
    };
    // Every nonempty category has a place, including Downloads online.
    return (offline ? [downloads, recent, all, favorites] : [recent, all, favorites, downloads])
      .filter(category => category.items.length > 0);
  }

  const order = offline
    ? [downloads, recent, favorites, playlists, albums]
    : [recent, favorites, playlists, albums, downloads];
  return order.filter(category => category.items.length > 0).slice(0, MAX_TABS);
}
