/**
 * Action `method:` reachability guard.
 *
 * `positionActions()` and `matchUpActions()` hand consumers actions shaped like
 * `{ type, method, payload }`, where `method` names the engine method to invoke.
 * A consumer that cannot see the constant behind that value has to hardcode the
 * literal — which is exactly what TMX did (`method: 'assignDrawPosition'`) for as
 * long as the 22 `*_METHOD` constants were exported by their modules but absent
 * from every exported object.
 *
 * That is the same defect class as `entryStatusConstants.REGISTERED` (a value the
 * factory produces, unreachable on the surface consumers actually use), but it is
 * not enum-backed, so the enum/const conformance guards cannot see it. This is its
 * counterpart: scan what `src/query/` EMITS, and require it to be reachable.
 *
 * Fails when a new action is added with a `method:` constant that never makes it
 * onto an exported constants object.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as factoryConstants from '@Constants/index';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const QUERY_DIR = join(ROOT, 'src/query');

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

/** CONST_CASE identifiers used as the `method:` value of an emitted action. */
function emittedMethodIdentifiers(): string[] {
  const found = new Set<string>();
  for (const file of tsFiles(QUERY_DIR)) {
    const src = readFileSync(file, 'utf8');
    const re = /method:\s*([A-Z][A-Z0-9_]*)\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) found.add(m[1]);
  }
  return [...found].sort();
}

/** Every constant NAME reachable on any exported constants object. */
function reachableConstantNames(): Set<string> {
  const names = new Set<string>();
  for (const [key, value] of Object.entries(factoryConstants as Record<string, unknown>)) {
    if (typeof value === 'string') names.add(key);
    if (value && typeof value === 'object') {
      for (const [innerKey, innerValue] of Object.entries(value as Record<string, unknown>)) {
        if (typeof innerValue === 'string') names.add(innerKey);
      }
    }
  }
  return names;
}

describe('action `method:` constants are reachable by consumers', () => {
  const emitted = emittedMethodIdentifiers();

  it('finds the emitted method identifiers (guard is actually scanning)', () => {
    // A tripwire: if the scan silently matches nothing — moved directory, changed
    // payload shape — the reachability assertion below would vacuously pass.
    expect(emitted.length).toBeGreaterThan(15);
    expect(emitted).toContain('ASSIGN_PARTICIPANT_METHOD');
  });

  it('every emitted method constant is reachable on an exported constants object', () => {
    const reachable = reachableConstantNames();
    const unreachable = emitted.filter((name) => !reachable.has(name));
    expect(unreachable).toEqual([]);
  });

  it('actionMethodConstants values are the engine method names, not the constant names', () => {
    // Guards against someone "fixing" a gap by adding NAME: 'NAME' placeholders.
    const { actionMethodConstants } = factoryConstants;
    for (const [name, value] of Object.entries(actionMethodConstants)) {
      expect(value, `${name} should hold an engine method name`).not.toBe(name);
      expect(value).toMatch(/^[a-z]/);
    }
  });
});
