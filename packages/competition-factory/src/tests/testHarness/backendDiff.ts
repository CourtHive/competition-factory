/** up to ten paths at which two plain values differ, each with both values (this engine's first) */
export function differingPaths(ours: any, theirs: any, path = '', out: string[] = []): string[] {
  if (out.length >= 10) return out;
  const isObject = (value: any) => value !== null && typeof value === 'object';
  if (isObject(ours) && isObject(theirs) && Array.isArray(ours) === Array.isArray(theirs)) {
    for (const key of new Set([...Object.keys(ours), ...Object.keys(theirs)]))
      differingPaths(ours[key], theirs[key], `${path}/${key}`, out);
  } else if (JSON.stringify(ours) !== JSON.stringify(theirs)) {
    const show = (value: any) => (value === undefined ? 'absent' : JSON.stringify(value).slice(0, 80));
    out.push(`${path} (${show(ours)} vs ${show(theirs)})`);
  }
  return out;
}
