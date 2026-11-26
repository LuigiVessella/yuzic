import TurboImage from 'react-native-turbo-image';
import { buildCover, buildCoverCacheKey } from '@/providers/registry/covers';
import { mmkv } from '@/state/mmkvStorage';
import type { CoverSource } from '@/domain/entities/Cover';

const DISK_CACHE_MIGRATION_KEY = 'image_cache_stable_keys_v1';

export function runImageCacheMigration() {
  if (mmkv.getBoolean(DISK_CACHE_MIGRATION_KEY)) return;
  TurboImage.clearDiskCache().catch(() => {});
  mmkv.set(DISK_CACHE_MIGRATION_KEY, true);
}

const IMAGE_CACHE_POLICY = 'dataCache' as const;
const MAX_FAILED_URLS = 300;
const FAILED_URL_RETRY_MS = 30_000;

const failedImageUrls = new Map<string, number>();
const failureListeners = new Set<() => void>();

export function subscribeImageFailures(listener: () => void): () => void {
  failureListeners.add(listener);
  return () => { failureListeners.delete(listener); };
}

function rememberFailedUrl(uri: string) {
  if (!uri) return;
  if (failedImageUrls.size >= MAX_FAILED_URLS) {
    const [oldest] = failedImageUrls.keys();
    if (oldest) failedImageUrls.delete(oldest);
  }
  failedImageUrls.set(uri, Date.now());
}

export function markImageUrlFailed(uri: string) {
  rememberFailedUrl(uri);
  failureListeners.forEach(listener => listener());
}

export function markImageUrlSucceeded(uri: string) {
  if (failedImageUrls.delete(uri)) failureListeners.forEach(listener => listener());
}

export function hasImageUrlFailed(uri: string | null | undefined): boolean {
  const failedAt = uri ? failedImageUrls.get(uri) : undefined;
  return failedAt !== undefined && Date.now() - failedAt < FAILED_URL_RETRY_MS;
}

export function prefetchCovers(
  covers: readonly (CoverSource | null | undefined)[],
  size: 'thumb' | 'grid' | 'detail' | 'background',
) {
  const sources = covers
    .filter((cover): cover is CoverSource => !!cover)
    .flatMap(cover => {
      const uri = buildCover(cover, size);
      if (!uri || hasImageUrlFailed(uri)) return [];
      const cacheKey = buildCoverCacheKey(cover, size) ?? uri;
      return [{ uri, cacheKey }];
    });

  const seen = new Set<string>();
  const deduped = sources.filter(s => {
    if (seen.has(s.cacheKey)) return false;
    seen.add(s.cacheKey);
    return true;
  });

  if (!deduped.length) return;

  TurboImage.prefetch(deduped, IMAGE_CACHE_POLICY).catch(() => {});
}

export function clearImageMemoryCache() {
  TurboImage.clearMemoryCache().catch(() => {});
}

export { IMAGE_CACHE_POLICY };
