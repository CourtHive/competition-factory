import { isDateInPast } from '@Tools/plainDate';
import { generateTimeCode } from '@Tools/timeCode';
import { setClock } from '@Tools/clock';
import { expect, it, vi } from 'vitest';

it('uses the explicit instant without reading the clock or changing the supplied Date', () => {
  const iso = '2026-11-24T21:00:00.000Z';
  const instant = new Date(iso);
  const source = vi.fn(() => instant);
  setClock(source);
  try {
    expect(isDateInPast(iso, instant)).toBe(false);
    expect(isDateInPast('2026-11-24T20:59:59.999Z', iso)).toBe(true);
    const code = generateTimeCode(-1, instant);
    expect(generateTimeCode(-1, iso)).toBe(code);
    expect(instant.toISOString()).toBe(iso);
    expect(() => generateTimeCode(0, 'invalid')).toThrow(RangeError);
    expect(source).not.toHaveBeenCalled();
    expect(generateTimeCode(-1)).toBe(code);
    expect(isDateInPast(iso)).toBe(false);
    expect(source).toHaveBeenCalledTimes(2);
  } finally {
    setClock();
  }
});
