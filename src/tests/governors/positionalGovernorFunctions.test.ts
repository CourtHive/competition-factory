import { POSITIONAL_GOVERNOR_FUNCTIONS } from './positionalGovernorFunctions';
import * as governors from '@Assemblies/governors';
import { describe, expect, it } from 'vitest';

/**
 * NO NEW POSITIONAL FUNCTION IN A GOVERNOR (CA 2026-11-07). A governor export is mounted on the engines, which call it
 * with one params object; a positional function there cannot be called correctly through an engine. It belongs in
 * `tools`. The functions already there are listed, by destination, in `positionalGovernorFunctions.ts`, and that list
 * may only shrink.
 */

const PARAMS_NAMES = /^(params|args|options|opts|props|input|_?param)\b/i;

/** a function whose first parameter is neither destructured nor a params object, read from its source */
function isPositional(fn: (...args: unknown[]) => unknown): boolean {
  const source = fn.toString();
  const match =
    source.match(/^(?:async\s+)?(?:function\s*\*?\s*[\w$]*\s*)?\(([^)]*)\)/) ??
    source.match(/^(?:async\s+)?([\w$]+)\s*=>/);
  const first = match?.[1].trim();
  return !!first && !first.startsWith('{') && !PARAMS_NAMES.test(first);
}

/** every positional function exported by a governor, with the governors that export it */
function positionalInGovernors(source: Record<string, unknown>): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const [governorName, governor] of Object.entries(source)) {
    if (!governor || typeof governor !== 'object') continue;
    for (const [name, fn] of Object.entries(governor)) {
      if (typeof fn !== 'function' || /^[A-Z]/.test(name) || !isPositional(fn as any)) continue;
      found.set(name, [...(found.get(name) ?? []), governorName]);
    }
  }
  return found;
}

const allowed = new Set<string>(Object.values(POSITIONAL_GOVERNOR_FUNCTIONS).flat());

describe('positional functions in governors', () => {
  const found = positionalInGovernors(governors as Record<string, unknown>);

  it('adds none beyond the listed ones', () => {
    const added = [...found.keys()].filter((name) => !allowed.has(name));
    const advice = added.map((name) => `${name} (${found.get(name)?.join(', ')})`);
    // a new positional function: export it from `tools` (by domain) instead of a governor
    expect(advice).toEqual([]);
  });

  it('lists none that has left, so the list only shrinks', () => {
    // no longer positional, or no longer in a governor: remove it from positionalGovernorFunctions.ts
    expect([...allowed].filter((name) => !found.has(name))).toEqual([]);
  });

  it('lists each function once', () => {
    const listed = Object.values(POSITIONAL_GOVERNOR_FUNCTIONS).flat();
    expect(listed.length).toEqual(allowed.size);
  });
});

// the detector itself: a guard whose scan matches nothing would pass vacuously
describe('the detector', () => {
  const planted = {
    plantedGovernor: {
      positional: (sets: unknown[], format: string) => [sets, format],
      defaulted: function (day: string, config = {}) {
        return [day, config];
      },
      destructured: ({ drawId }: { drawId: string }) => drawId,
      params: (params: { drawId: string }) => params.drawId,
      noArguments: () => undefined,
      ConstructorLike: class {},
    },
  };

  it('finds positional functions and nothing else', () => {
    expect([...positionalInGovernors(planted).keys()].sort()).toEqual(['defaulted', 'positional']);
  });

  it('sees the known positional functions in the real governors', () => {
    const found = positionalInGovernors(governors as Record<string, unknown>);
    expect(found.get('validateMatchUpScore')).toContain('scoreGovernor');
    expect(found.size).toBeGreaterThan(50);
  });
});
