jest.mock('@/providers/http/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn() }));

import { fetchWithTimeout } from '@/providers/http/fetchWithTimeout';
import { createMusicbrainzClient } from './index';

const fetchMock = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>;

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

/** Lets every promise that is ready to run do so. */
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const urlOfCall = (index: number) => String(fetchMock.mock.calls[index][0]);

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(ok({ artists: [] }));
});

describe('MusicBrainz client address', () => {
  it('searches both artist-title orders for a recording in one request', async () => {
    fetchMock.mockResolvedValue(ok({ recordings: [{ id: 'rec-1', title: 'Lontano' }] }));
    const found = await createMusicbrainzClient({ serverUrl: 'http://nas:5000' })
      .searchRecordingByTitle('Lontano - Sfera Ebbasta');
    const query = new URL(urlOfCall(0)).searchParams.get('query');
    expect(query).toContain('recording:"Lontano" AND artist:"Sfera Ebbasta"');
    expect(query).toContain('recording:"Sfera Ebbasta" AND artist:"Lontano"');
    expect(found[0].id).toBe('rec-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('asks the public server when no address is given', async () => {
    await createMusicbrainzClient().searchArtist('Muse');
    expect(urlOfCall(0).startsWith('https://musicbrainz.org/ws/2/artist?query=')).toBe(true);
  });

  it('asks the public server when the address is blank', async () => {
    await createMusicbrainzClient({ serverUrl: '   ' }).searchArtist('Muse');
    expect(urlOfCall(0).startsWith('https://musicbrainz.org/ws/2/artist?query=')).toBe(true);
  });

  it('adds /ws/2 to the root address of a server of your own', async () => {
    await createMusicbrainzClient({ serverUrl: 'http://nas:5000' }).searchArtist('Muse');
    expect(urlOfCall(0).startsWith('http://nas:5000/ws/2/artist?query=')).toBe(true);
  });

  it.each([
    ['a trailing slash', 'http://nas:5000/'],
    ['several trailing slashes', 'http://nas:5000///'],
    ['surrounding spaces', '  http://nas:5000  '],
    ['a pasted /ws/2', 'http://nas:5000/ws/2'],
    ['a pasted /ws/2/', 'http://nas:5000/ws/2/'],
  ])('reaches the same place with %s', async (_label, serverUrl) => {
    await createMusicbrainzClient({ serverUrl }).getReleaseGroup('abc');
    expect(urlOfCall(0)).toBe('http://nas:5000/ws/2/release-group/abc?inc=artist-credits&fmt=json');
  });

  it('keeps a path the server is served under', async () => {
    await createMusicbrainzClient({ serverUrl: 'https://home.example/musicbrainz/' }).searchArtist('Muse');
    expect(urlOfCall(0).startsWith('https://home.example/musicbrainz/ws/2/artist?query=')).toBe(true);
  });

  it('identifies the app the same way on either server', async () => {
    await createMusicbrainzClient().searchArtist('Muse');
    await createMusicbrainzClient({ serverUrl: 'http://nas:5000' }).searchArtist('Muse');
    const [publicInit, ownInit] = fetchMock.mock.calls.map(call => call[1]);
    expect(publicInit).toEqual(ownInit);
    expect(publicInit).toEqual({
      headers: expect.objectContaining({ 'User-Agent': 'yuzic/1.0 (https://github.com/yuzic)' }),
    });
  });

  it('fails with the status when the server answers with an error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);
    await expect(createMusicbrainzClient().searchArtist('Muse')).rejects.toThrow('MusicBrainz 503');
  });
});

describe('MusicBrainz client spacing', () => {
  beforeEach(() => {
    // A request that never finishes, so what runs is only what was allowed to start.
    fetchMock.mockReturnValue(new Promise<Response>(() => {}));
  });

  it('queues the public server’s calls behind one another', async () => {
    const client = createMusicbrainzClient();
    void client.searchArtist('a');
    void client.searchArtist('b');
    void client.searchArtist('c');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not queue calls to a server of your own', async () => {
    const client = createMusicbrainzClient({ serverUrl: 'http://nas:5000' });
    void client.searchArtist('a');
    void client.searchArtist('b');
    void client.searchArtist('c');
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('MusicBrainz discography and editions', () => {
  const client = createMusicbrainzClient({ serverUrl: 'http://nas:5000' });

  it('browses release groups beyond the first 25 without a new name search', async () => {
    fetchMock.mockResolvedValue(ok({ 'release-groups': [{ id: 'group-26', title: 'Later Album' }] }));
    expect(await client.getArtistReleaseGroups('artist-id', 25, 25)).toHaveLength(1);
    expect(urlOfCall(0)).toContain('/release-group?artist=artist-id&inc=artist-credits&limit=25&offset=25');
  });

  it('chooses a stable original official edition and preserves disc positions', async () => {
    fetchMock.mockResolvedValue(ok({ releases: [
      { id: 'reissue', date: '2020', media: [{ tracks: [{ id: 'bonus', position: 1 }] }] },
      { id: 'original', date: '1990', media: [
        { position: 1, tracks: [{ id: 'first', position: 1 }] },
        { position: 2, tracks: [{ id: 'second', position: 1 }] },
      ] },
    ] }));
    expect(await client.getTracksForReleaseGroup('group-id')).toMatchObject([
      { id: 'first', position: 1, discNumber: 1 }, { id: 'second', position: 1, discNumber: 2 },
    ]);
    expect(urlOfCall(0)).toContain('status=official');
  });

  it('does not send an aborted search to the server', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(createMusicbrainzClient().searchArtist('old query', 5, controller.signal)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
