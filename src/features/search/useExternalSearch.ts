import { useCallback, useEffect, useRef, useState } from 'react';
import { dedupeAndSort, type SearchResult } from './searchRanking';
import { searchExternalLeg, type SearchEntityType } from './searchPolicy';

type SourceStatus = 'pending' | 'failed' | 'ready';
type ExternalSearch = {
  controller: AbortController;
  query: string;
  entityTypes: SearchEntityType[];
  statuses: Record<string, SourceStatus>;
};

export function useExternalSearch(
  canReachExternal: boolean,
  setSearchResults: React.Dispatch<React.SetStateAction<SearchResult[]>>,
) {
  const [sourceStatuses, setSourceStatuses] = useState<ExternalSearch['statuses']>({});
  const externalSearch = useRef<ExternalSearch | null>(null);
  useEffect(() => () => externalSearch.current?.controller.abort(), []);

  const clearExternal = useCallback(() => {
    externalSearch.current?.controller.abort();
    externalSearch.current = null;
    setSourceStatuses({});
  }, []);

  const runExternal = useCallback(async (request: ExternalSearch, ids: string[]) => {
    const settled = new Set<string>();
    const complete = (id: string, results: SearchResult[] | null) => {
      settled.add(id);
      if (externalSearch.current !== request || request.controller.signal.aborted) return;
      request.statuses[id] = results ? 'ready' : 'failed';
      setSourceStatuses({ ...request.statuses });
      if (results?.length) {
        setSearchResults(previous => dedupeAndSort([...previous, ...results], request.query.toLowerCase()));
      }
    };
    try {
      await searchExternalLeg(ids, request.query, request.entityTypes, request.controller.signal, complete);
    } catch {
      // Each attempted provider has already reported its own failure.
    }
    for (const id of ids) {
      if (!settled.has(id)) complete(id, []);
    }
  }, [setSearchResults]);

  const startExternal = useCallback((query: string, entityTypes: SearchEntityType[], ids: string[]) => {
    const request: ExternalSearch = {
      controller: new AbortController(),
      query,
      entityTypes,
      statuses: Object.fromEntries(ids.map(id => [id, 'pending'])),
    };
    externalSearch.current = request;
    setSourceStatuses({ ...request.statuses });
    return runExternal(request, ids);
  }, [runExternal]);

  const retrySource = useCallback((sourceId: string) => {
    const request = externalSearch.current;
    if (!canReachExternal || request?.statuses[sourceId] !== 'failed') return;
    request.statuses[sourceId] = 'pending';
    setSourceStatuses({ ...request.statuses });
    void runExternal(request, [sourceId]);
  }, [canReachExternal, runExternal]);

  return { sourceStatuses, startExternal, clearExternal, retrySource };
}
