/** Whether the requested direction can actually select another queue item. */
export function canStartCoverSlide(
  direction: 'next' | 'previous',
  currentIndex: number,
  queueLength: number,
  repeatMode: 'off' | 'all' | 'one',
): boolean {
  // Called from the cover pan's UI-thread callback.
  'worklet';
  if (queueLength <= 0) return false;
  if (direction === 'previous') return currentIndex > 0;
  return currentIndex < queueLength - 1 || repeatMode === 'all';
}
