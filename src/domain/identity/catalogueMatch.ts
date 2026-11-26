import { normalizeName } from './matching';

/** A name lookup is safe only when exactly one candidate agrees. */
export function uniqueNameMatch<T>(candidates: readonly T[], name: string, nameOf: (item: T) => string): T | null {
  const expected = normalizeName(name);
  if (!expected) return null;
  const matches = candidates.filter(item => normalizeName(nameOf(item)) === expected);
  return matches.length === 1 ? matches[0] : null;
}
