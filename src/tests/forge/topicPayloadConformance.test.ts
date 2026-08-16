import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

import * as topicConstants from '@Constants/topicConstants';

/**
 * TopicPayloadMap ↔ addNotice conformance.
 *
 * `src/forge/topicTypes.ts` declares payload shapes that its own header describes as "derived from
 * inspection of `addNotice({ topic, payload })` callsites" — a hand-maintained mirror of code it cannot
 * see change. #4630 added a guard that every typed map KEY is a real topic constant; this is the other
 * half, and the half that actually rots: does each declared REQUIRED field still get emitted?
 *
 * Same failure class as `factoryConstants.REGISTERED` shipping `undefined` in 6.16.0/6.17.0 — a
 * hand-maintained mirror guarded on the wrong axis.
 *
 * DIRECTION MATTERS. This asserts `declared-required ⊆ actually-emitted`. A map promising a field the
 * emitter does not send is what silently breaks a consumer. The reverse — emitted fields absent from the
 * map — is mere incompleteness, and the map is explicitly partial by design, so it is reported for
 * visibility but not failed.
 */

const SRC = path.resolve(__dirname, '../../');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (entry === 'tests' || entry === 'node_modules') continue;
      walk(p, out);
    } else if (entry.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Substring of the balanced (...) or {...} beginning at `i`. */
function balanced(s: string, i: number, open: string, close: string): string | null {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === open) depth++;
    else if (s[j] === close) {
      depth--;
      if (depth === 0) return s.slice(i + 1, j);
    }
  }
  return null;
}

/** Top-level keys of an object-literal body. */
function topLevelKeys(body: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if ('{[('.includes(ch)) depth++;
    else if ('}])'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      keys.push(cur);
      cur = '';
    } else cur += ch;
  }
  keys.push(cur);
  return keys
    .map((k) => k.trim())
    .filter(Boolean)
    .map((k) => {
      const spread = /^\.\.\.(\w+)/.exec(k);
      if (spread) return `...${spread[1]}`;
      const named = /^([\w'"]+)\s*:/.exec(k);
      if (named) return named[1].replace(/['"]/g, '');
      const shorthand = /^(\w+)\s*$/.exec(k);
      return shorthand ? shorthand[1] : '';
    })
    .filter(Boolean);
}

/** topic-constant NAME -> array of emitted top-level payload key sets */
function extractEmittedPayloads(): Map<string, string[][]> {
  const byTopic = new Map<string, string[][]>();
  for (const file of walk(SRC)) {
    if (file.includes(`${path.sep}forge${path.sep}`)) continue; // the map itself, not an emitter
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/addNotice\s*\(/g)) {
      const body = balanced(src, m.index! + m[0].length - 1, '(', ')');
      if (!body) continue;
      const topicMatch = /topic:\s*([A-Za-z0-9_]+)/.exec(body);
      if (!topicMatch) continue;
      const payloadAt = /payload:\s*\{/.exec(body);
      if (!payloadAt) continue; // payload passed as an identifier — shape not statically knowable
      const payloadBody = balanced(body, payloadAt.index + payloadAt[0].length - 1, '{', '}');
      if (payloadBody === null) continue;
      const list = byTopic.get(topicMatch[1]) ?? [];
      list.push(topLevelKeys(payloadBody));
      byTopic.set(topicMatch[1], list);
    }
  }
  return byTopic;
}

/** map key -> required (non-optional) field names declared in its payload interface */
function extractDeclaredRequired(): Map<string, string[]> {
  const src = readFileSync(path.join(SRC, 'forge/topicTypes.ts'), 'utf8');

  const interfaces = new Map<string, string[]>();
  for (const m of src.matchAll(/export interface (\w+)[^{]*\{/g)) {
    const body = balanced(src, m.index! + m[0].length - 1, '{', '}');
    if (body === null) continue;
    const required = [...body.matchAll(/^\s{2}(\w+)(\??):/gm)].filter((f) => f[2] !== '?').map((f) => f[1]);
    interfaces.set(m[1], required);
  }

  const mapBody = balanced(src, src.indexOf('{', src.indexOf('export interface TopicPayloadMap')), '{', '}') ?? '';
  const out = new Map<string, string[]>();
  for (const m of mapBody.matchAll(/^\s{2}(\w+):\s*(\w+);/gm)) {
    out.set(m[1], interfaces.get(m[2]) ?? []);
  }
  return out;
}

describe('TopicPayloadMap conformance with addNotice callsites', () => {
  const emitted = extractEmittedPayloads();
  const declared = extractDeclaredRequired();

  // topic CONSTANT NAME -> constant VALUE (the map is keyed by value)
  const constNameToValue = new Map(
    Object.entries(topicConstants).filter(([, v]) => typeof v === 'string') as [string, string][],
  );

  it('the extractor actually finds callsites (guards against a vacuous pass)', () => {
    expect(emitted.size).toBeGreaterThan(20);
    expect(declared.size).toBeGreaterThan(10);
  });

  it('every REQUIRED field declared in the map is emitted by every callsite for that topic', () => {
    const violations: string[] = [];

    for (const [topicValue, requiredFields] of declared) {
      if (!requiredFields.length) continue;
      const constName = [...constNameToValue].find(([, v]) => v === topicValue)?.[0];
      if (!constName) continue; // key-name drift is #4630's guard, not this one
      const callsites = emitted.get(constName);
      if (!callsites?.length) continue; // emitted via a non-literal payload, or no static callsite

      for (const keys of callsites) {
        // A spread could supply anything; treat its presence as satisfying the check rather than
        // reporting a false violation.
        if (keys.some((k) => k.startsWith('...'))) continue;
        for (const field of requiredFields) {
          if (!keys.includes(field)) violations.push(`${topicValue}.${field} declared required, not emitted`);
        }
      }
    }

    expect({ violations: [...new Set(violations)] }).toEqual({ violations: [] });
  });
});
