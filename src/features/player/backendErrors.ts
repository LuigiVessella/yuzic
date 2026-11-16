import type { BackendEvent } from './backend';

const MAINTENANCE = new Set([
  'clearCache', 'evict', 'configureCache', 'setBrowseTree', 'clearBrowseTree',
  'setCommands', 'setEqualizer', 'setLoudness', 'setCrossfade', 'setVolume',
  'setSpeed', 'setRepeatMode', 'sleepAfter', 'cancelSleep',
]);

/** Bridge rejections are not evidence that the current audio source failed. */
export function operationFailure(operation: string, error: unknown): BackendEvent {
  return {
    type: 'operationError', kind: MAINTENANCE.has(operation) ? 'maintenance' : 'command',
    operation, code: 'ENGINE_CALL_FAILED', message: `${operation}: ${String(error)}`,
  };
}
