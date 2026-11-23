/**
 * The first `open … close` span with at least one character inside and no `close` inside, as `[span, inner]`:
 * exactly what `/\(([^)]+)\)/.exec` returns for `(` and `)`, but in linear time.
 *
 * WHY: that regex is quadratic in the input length (CodeQL #245, #246). From each unmatched `open` it scans to the end
 * before giving up, so 100k characters cost ~4.3 s, and score strings arrive from clients uncapped.
 */
export function firstEnclosed(value: string | undefined, open: string, close: string): [string, string] | null {
  if (typeof value !== 'string') return null;
  let from = 0;
  for (;;) {
    const start = value.indexOf(open, from);
    if (start < 0) return null;
    const end = value.indexOf(close, start + 1);
    // no close after this open means none after any later open either
    if (end < 0) return null;
    if (end > start + 1) return [value.slice(start, end + 1), value.slice(start + 1, end)];
    // empty span: the regex moves on to the next open; the close found here was adjacent, so this rescans nothing
    from = start + 1;
  }
}
