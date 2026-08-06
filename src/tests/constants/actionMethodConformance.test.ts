/**
 * Action `method:` validity guard.
 *
 * `positionActions()` and `matchUpActions()` hand consumers actions shaped like
 * `{ type, method, payload }`, where `method` names the engine method to invoke.
 * The invariant worth protecting is that those names are REAL — rename an engine
 * method and the actions keep emitting the old string, which fails at consumer
 * dispatch time as "method not found", in someone else's codebase.
 *
 * `actionMethodConstants` is typed `Record<string, FactoryEngineMethod>`, so tsc
 * catches an invalid name at the aggregation point. This file covers the two gaps
 * that typing alone leaves:
 *
 *   1. COMPLETENESS — a newly added action method that never reaches
 *      `actionMethodConstants` is simply not covered by that type. The scan of what
 *      `src/query/` actually emits is what keeps the enumeration honest.
 *   2. BUILT OUTPUT — the type can be bypassed (`as any`, a `.js` source). The
 *      runtime check re-verifies values against the generated method union.
 *
 * Note this deliberately does NOT assert that consumers need these constants. They
 * do not: nothing in the ecosystem branches on `action.method` — consumers forward
 * it verbatim, and branching keys off `action.type`, which was always exported.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { actionMethodConstants } from '@Constants/actionMethodConstants';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const QUERY_DIR = join(ROOT, 'src/query');
const ENGINE_METHODS_FILE = join(ROOT, 'src/types/factoryEngineMethods.ts');

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

/** The generated FactoryEngineMethod union, read as data. */
function engineMethodNames(): Set<string> {
  const src = readFileSync(ENGINE_METHODS_FILE, 'utf8');
  return new Set([...src.matchAll(/\| '([^']+)'/g)].map((m) => m[1]));
}

describe('action `method:` validity', () => {
  const emitted = emittedMethodIdentifiers();

  it('the scan actually finds emitted method identifiers', () => {
    // Tripwire. If the scan silently matches nothing — directory moved, payload
    // shape changed — the completeness assertion below would vacuously pass.
    expect(emitted.length).toBeGreaterThan(15);
    expect(emitted).toContain('ASSIGN_PARTICIPANT_METHOD');
  });

  it('every emitted method constant is enumerated in actionMethodConstants', () => {
    // Completeness: this is what keeps the typed aggregate covering the full set.
    const missing = emitted.filter((name) => !(name in actionMethodConstants));
    expect(missing).toEqual([]);
  });

  it('every enumerated method resolves to a real engine method', () => {
    // Runtime mirror of the Record<string, FactoryEngineMethod> type, so an
    // `as any` or a .js source cannot smuggle a dead method name through.
    const engineMethods = engineMethodNames();
    expect(engineMethods.size).toBeGreaterThan(500); // tripwire on the union parse
    const dead = Object.entries(actionMethodConstants)
      .filter(([, value]) => !engineMethods.has(value))
      .map(([name, value]) => `${name} → ${value}`);
    expect(dead).toEqual([]);
  });
});
