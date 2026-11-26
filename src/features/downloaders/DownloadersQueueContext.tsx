import React, {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useApi } from '@/providers/registry/useApi';
import { useSelector } from 'react-redux';
import { selectActiveServerId } from '@/state/redux/selectors/serversSelectors';
import { useAppActive } from '@/features/connectivity/useAppActive';
import { useIsOffline } from '@/features/connectivity/useIsOffline';
import { usePollWhile } from '@/state/query/usePollWhile';
import { useSync } from '@/features/library/useSync';
import { useDownloaderStates, type DownloaderState } from './registry';
import { finishedSince, type DownloaderQueueItem } from './queueItem';
import type { DownloaderId } from '@/state/redux/slices/downloadersSlice';
import { useScanAfterDownloads } from './useScanAfterDownloads';

// A completed download on a downloader (Lidarr/slskd) writes to the media
// library the same way a manual copy would — the server has no way to know
// until it scans. This poll interval balances "the new album shows up
// promptly" against "we're not hammering an idle downloader all day".
const POLL_INTERVAL_MS = 30_000;
const MAX_POLL_INTERVAL_MS = 240_000;

type QueueRead = {
  state: DownloaderState;
  previous: DownloaderQueueItem[];
  inFlight: boolean;
  interval: number;
  nextPollAt: number;
};

type DownloaderQueueSnapshot = {
  id: DownloaderId;
  label: string;
  /** Everything listed, finished rows too. Empty is a real answer, not "unread". */
  items: DownloaderQueueItem[];
  count: number; // Active rows only — Downtify lists `done` jobs until cleared (#304).
  /** True only until the first read lands, so a list does not flash a spinner. */
  isLoading: boolean;
  /** The last read failed. The items above are then the previous good read. */
  hasError: boolean;
};

type ContextValue = {
  /** One entry per connected downloader, queued or not. */
  queues: DownloaderQueueSnapshot[];
  /** Total items across all connected downloaders. */
  totalInFlight: number;
  /** Items that left a queue since the last read, for whoever wants to react. */
  recentlyFinished: DownloaderQueueItem[];
  /**
   * Read every connected downloader again, now.
   *
   * The poll is on a 30-second interval, which is right for a background
   * count and far too long to watch after asking for something. This is the
   * same read the interval performs, not a second one — an in-flight
   * downloader is skipped rather than asked twice.
   */
  refresh: () => void;
};

const DownloadersQueueContext = createContext<ContextValue>({
  queues: [],
  totalInFlight: 0,
  recentlyFinished: [],
  refresh: () => {},
});

/**
 * The single background poller for every connected downloader.
 *
 *   1. Detect completions — items that disappeared since the last read — and
 *      trigger a server rescan plus a forced library sync. A downloader that
 *      finishes writes into the library the way a manual copy would, and the
 *      media server has no idea until it looks.
 *   2. Expose the whole queue per downloader, so every surface that wants to
 *      know what is transferring reads one snapshot instead of opening its own
 *      connection to the same server.
 *
 * Mounted once at the top of the home layout.
 */
export function DownloadersQueueProvider({ children }: { children: ReactNode }) {
  const states = useDownloaderStates();
  const api = useApi();
  const serverId = useSelector(selectActiveServerId);
  const { sync } = useSync();
  const scanAndSync = useScanAfterDownloads(serverId, api.auth.startScan, sync);
  const isAppActive = useAppActive();
  const isOffline = useIsOffline();

  const [queues, setQueues] = useState<DownloaderQueueSnapshot[]>([]);

  const [recentlyFinished, setRecentlyFinished] = useState<DownloaderQueueItem[]>([]);

  const reads = useRef(new Map<DownloaderId, QueueRead>());

  const connectedStates = useMemo(() => states.filter((s) => s.isConnected), [states]);
  const shouldPoll = connectedStates.length > 0 && isAppActive && !isOffline;
  const tick = usePollWhile(shouldPoll, POLL_INTERVAL_MS);

  useLayoutEffect(() => () => {
    reads.current.clear();
  }, [serverId]);

  useLayoutEffect(() => {
    const next = new Map<DownloaderId, QueueRead>();
    const retained = new Set<DownloaderId>();
    for (const state of connectedStates) {
      const id = state.def.id;
      const read = reads.current.get(id);
      if (read && read.state.config.serverUrl === state.config.serverUrl
        && read.state.config.apiKey === state.config.apiKey
        && read.state.config.preferences === state.config.preferences) {
        read.state = state;
        retained.add(id);
        next.set(id, read);
      } else {
        next.set(id, { state, previous: [], inFlight: false, interval: POLL_INTERVAL_MS, nextPollAt: 0 });
      }
    }
    reads.current = next;
    setQueues(previous => {
      const kept = previous.filter(queue => retained.has(queue.id));
      return kept.length === previous.length ? previous : kept;
    });
  }, [connectedStates, serverId]);

  useLayoutEffect(() => { setRecentlyFinished([]); }, [serverId]);

  /**
   * Replace one downloader's entry, keeping the rest.
   *
   * Every connected downloader keeps an entry whether or not anything is
   * queued — an empty queue is a real answer, and dropping the row for one
   * made "nothing is transferring" indistinguishable from "not read yet",
   * which is what a card needs to tell apart to stop flashing its spinner.
   */
  const updateQueue = useCallback((
    state: DownloaderState,
    patch: Partial<DownloaderQueueSnapshot>
  ) => {
    setQueues((prev) => {
      const existing = prev.find((q) => q.id === state.def.id);
      const next: DownloaderQueueSnapshot = {
        id: state.def.id,
        label: state.def.label,
        items: existing?.items ?? [],
        count: existing?.count ?? 0,
        isLoading: existing?.isLoading ?? true,
        hasError: existing?.hasError ?? false,
        ...patch,
      };
      // Replaced where it already sits, rather than appended. Moving the
      // downloader that just answered to the end reordered the list on every
      // poll — see the ordering note on `value` below.
      return existing
        ? prev.map((q) => (q.id === next.id ? next : q))
        : [...prev, next];
    });
  }, []);

  const pollOne = useCallback(async (read: QueueRead, force = false) => {
    if (read.inFlight || (!force && Date.now() < read.nextPollAt)) return;
    read.inFlight = true;
    const { state } = read;
    try {
      const items = await state.def.fetchQueue(state.config);
      if (reads.current.get(state.def.id) !== read) return;
      const finished = finishedSince(read.previous, items);
      read.previous = items;
      read.interval = POLL_INTERVAL_MS;
      read.nextPollAt = 0;
      updateQueue(state, {
        items,
        count: items.filter((item) => item.active).length,
        isLoading: false,
        hasError: false,
      });
      if (finished.length > 0) {
        setRecentlyFinished(finished);
        scanAndSync();
      }
    } catch {
      // Transient reachability failure. The previous items stay: showing an
      // empty queue because one read failed would look like every transfer
      // had finished.
      if (reads.current.get(state.def.id) !== read) return;
      read.interval = Math.min(read.interval * 2, MAX_POLL_INTERVAL_MS);
      read.nextPollAt = Date.now() + read.interval;
      updateQueue(state, { isLoading: false, hasError: true });
    } finally {
      read.inFlight = false;
    }
  }, [scanAndSync, updateQueue]);

  useEffect(() => {
    if (!shouldPoll) return;
    for (const read of reads.current.values()) void pollOne(read);
  }, [shouldPoll, tick, connectedStates, serverId, pollOne]);

  // Keep refresh stable for consumers while using the latest poll policy.
  const pollRef = useRef({ shouldPoll, pollOne });
  pollRef.current = { shouldPoll, pollOne };
  const refresh = useCallback(() => {
    const { shouldPoll: enabled, pollOne: poll } = pollRef.current;
    if (enabled) for (const read of reads.current.values()) void poll(read, true);
  }, []);

  /**
   * Registry order, which is the one thing here that does not depend on the
   * network. Poll order does: two downloaders answer whenever their servers
   * get round to it, and the list used to be built in that order — so the Home
   * banner swapped "11 on Lidarr · 0 on slskd" for "0 on slskd · 11 on Lidarr"
   * and back, on a loop, without a single count ever changing. Sorting here
   * rather than at the banner keeps every surface reading one order.
   */
  const orderedQueues = useMemo(() => {
    const byId = new Map(queues.map((q) => [q.id, q]));
    return connectedStates
      .map((state) => byId.get(state.def.id))
      .filter((q): q is DownloaderQueueSnapshot => q !== undefined);
  }, [connectedStates, queues]);

  const value = useMemo<ContextValue>(() => ({
    queues: orderedQueues,
    totalInFlight: orderedQueues.reduce((sum, q) => sum + q.count, 0),
    recentlyFinished,
    refresh,
  }), [orderedQueues, recentlyFinished, refresh]);

  return (
    <DownloadersQueueContext.Provider value={value}>
      {children}
    </DownloadersQueueContext.Provider>
  );
}

export function useDownloadersQueue(): ContextValue {
  return useContext(DownloadersQueueContext);
}
