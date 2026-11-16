/** Fill the car's missing collections without flooding the server. */
export async function loadCarDetails(
  tasks: (() => Promise<unknown>)[],
  onBatch: () => void,
  cancelled: () => boolean,
): Promise<void> {
  for (let offset = 0; offset < tasks.length && !cancelled(); offset += 3) {
    await Promise.allSettled(tasks.slice(offset, offset + 3).map(task => Promise.resolve().then(task)));
    if (!cancelled()) onBatch();
  }
}
