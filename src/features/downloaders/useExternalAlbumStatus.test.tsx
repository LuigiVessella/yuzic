import { renderHook } from '@testing-library/react-native';
import { useExternalAlbumStatus } from './useExternalAlbumStatus';
import type { Album } from '@/domain/entities/Album';

let mockLibrary: Album[] = [];
let mockQueues: unknown[] = [];
let mockWants: unknown[] = [];
jest.mock('@/features/album/useAlbums', () => ({ useAlbums: () => ({ albums: mockLibrary }) }));
jest.mock('./DownloadersQueueContext', () => ({ useDownloadersQueue: () => ({ queues: mockQueues }) }));
jest.mock('react-redux', () => ({ useSelector: () => mockWants }));

const album = { localId: 'album', title: 'Album', artist: { name: 'Artist' }, externalIds: { mbid: 'group' } } as Album;

it('follows a request through queued, import and library arrival using the shared snapshot', async () => {
  mockWants = [{ unit: 'album', localId: 'album', title: 'Album', artist: 'Artist', jobRef: { downloader: 'lidarr', requestedAt: Date.now() } }];
  const { result, rerender } = await renderHook(() => useExternalAlbumStatus(album));
  expect(result.current.kind).toBe('queued');
  mockQueues = [{ id: 'lidarr', items: [{ title: 'Album', artistName: 'Artist', identity: 'exact', active: false, percentComplete: 100 }] }];
  await rerender({});
  expect(result.current.kind).toBe('processing');
  mockLibrary = [album];
  await rerender({});
  expect(result.current.kind).toBe('in_library');
});
