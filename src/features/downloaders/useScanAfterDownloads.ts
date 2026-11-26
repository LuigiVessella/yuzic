import { useCallback, useLayoutEffect, useRef } from 'react';

const SCAN_BATCH_MS = 500;
// A slow server scan may need a later catalog refresh.
const SYNC_DELAYS_MS = [15_000, 60_000];

export function useScanAfterDownloads(
  serverId: string | null | undefined,
  startScan: () => Promise<unknown>,
  sync: (force: boolean) => Promise<unknown>,
) {
  const batch = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncTimers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useLayoutEffect(() => () => {
    if (batch.current !== null) clearTimeout(batch.current);
    batch.current = null;
    syncTimers.current.forEach(clearTimeout);
    syncTimers.current.clear();
  }, [serverId]);

  return useCallback(() => {
    if (!serverId || batch.current !== null) return;
    batch.current = setTimeout(() => {
      batch.current = null;
      void startScan().catch(() => {});
      for (const delay of SYNC_DELAYS_MS) {
        const timer = setTimeout(() => {
          syncTimers.current.delete(timer);
          void sync(true).catch(() => {});
        }, delay);
        syncTimers.current.add(timer);
      }
    }, SCAN_BATCH_MS);
  }, [serverId, startScan, sync]);
}
