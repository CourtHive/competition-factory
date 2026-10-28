/**
 * Where two tournament records differ, for the method-list replay tests: at most eight paths, apart from the times
 * each write stamps, with a key holding undefined treated as absent (a record that is saved and read back does not
 * have it).
 */

// the stamps a write takes from the clock: when it happened, not what it wrote
const TIME_KEYS = new Set(['createdAt', 'updatedAt', 'timeStamp', 'scoredTime']);

export function differences(a: unknown, b: unknown, path = '', found: string[] = []): string[] {
  if (found.length >= 8) return found;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) found.push(`${path} length ${a.length} != ${b.length}`);
    a.slice(0, b.length).forEach((value, index) => differences(value, b[index], `${path}[${index}]`, found));
  } else if (a && b && typeof a === 'object' && typeof b === 'object') {
    const [x, y] = [a as Record<string, unknown>, b as Record<string, unknown>];
    for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) {
      // a key holding undefined is not stored: a record that is saved and read back does not have it
      const [inA, inB] = [x[key] !== undefined, y[key] !== undefined];
      if (TIME_KEYS.has(key) || (!inA && !inB)) continue;
      if (!inA || !inB) found.push(`${path}/${key} only in ${inA ? 'generated' : 'replayed'}`);
      else differences(x[key], y[key], `${path}/${key}`, found);
    }
  } else if (a !== b) {
    found.push(`${path}: ${JSON.stringify(a)?.slice(0, 60)} != ${JSON.stringify(b)?.slice(0, 60)}`);
  }
  return found;
}
