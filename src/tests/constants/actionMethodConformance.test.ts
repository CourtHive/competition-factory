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
import ts from 'typescript';
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

/**
 * Identifiers used as the `method:` value of an emitted action, found by walking the
 * AST rather than matching text.
 *
 * The previous implementation was a regex requiring an uppercase identifier directly
 * after `method:`. A ternary — `method: cond ? A : B` — starts with a lowercase token,
 * so the match failed and BOTH branches escaped every check in this file. An adversarial
 * audit proved it by shipping an action pointing at a method that does not exist on the
 * engine. Property-assignment nodes cannot be dodged by formatting or expression shape.
 */
function emittedMethodIdentifiers(): { names: string[]; unresolved: string[] } {
  const names = new Set<string>();
  const literals = new Set<string>();
  const unresolved = new Set<string>();

  /** Collect every identifier reachable as a value of this expression. */
  const collect = (node: ts.Node, file: string): void => {
    if (ts.isIdentifier(node)) {
      names.add(node.text);
      return;
    }
    if (ts.isConditionalExpression(node)) {
      collect(node.whenTrue, file);
      collect(node.whenFalse, file);
      return;
    }
    // `a ?? b`, `a || b` — either side can be the emitted value.
    if (ts.isBinaryExpression(node)) {
      collect(node.left, file);
      collect(node.right, file);
      return;
    }
    if (ts.isParenthesizedExpression(node)) {
      collect(node.expression, file);
      return;
    }
    if (ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
      collect(node.expression, file);
      return;
    }
    // An inline literal bypasses the constant vocabulary. It is still statically
    // resolvable, so rather than fail outright it is held to the weaker but still
    // meaningful invariant: it must name a real engine method.
    if (ts.isStringLiteralLike(node)) {
      literals.add(node.text);
      return;
    }
    // Anything else (call, property access, spread) cannot be resolved statically.
    unresolved.add(`${file}: ${ts.SyntaxKind[node.kind]}`);
  };

  for (const file of tsFiles(QUERY_DIR)) {
    const sourceFile = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const short = file.slice(file.indexOf('src/query'));
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === 'method') {
        // Only an INVOCATION payload counts. `{ method, params }` (a mutation pushed onto
        // an executionQueue array) and `{ type, method, payload }` (an action) both carry a
        // sibling; `pushGlobalLog({ method: 'fnName' })` does not — there `method` is the
        // name of the enclosing function, not an engine method, and treating it as one was
        // a false positive on the first draft of this walk.
        const parent = node.parent;
        const hasSibling =
          ts.isObjectLiteralExpression(parent) &&
          parent.properties.some(
            (prop) => prop.name && ts.isIdentifier(prop.name) && ['params', 'payload'].includes(prop.name.text),
          );
        if (hasSibling) collect(node.initializer, short);
      }
      // `{ method }` shorthand — the value is the identifier itself.
      if (ts.isShorthandPropertyAssignment(node) && node.name.text === 'method') {
        names.add(node.name.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  // Only CONST_CASE identifiers are vocabulary constants; locals like `method` are not.
  return {
    names: [...names].filter((n) => /^[A-Z][A-Z0-9_]*$/.test(n)).sort(),
    literals: [...literals].sort(),
    unresolved: [...unresolved].sort(),
  };
}

/** The generated FactoryEngineMethod union, read as data. */
function engineMethodNames(): Set<string> {
  const src = readFileSync(ENGINE_METHODS_FILE, 'utf8');
  return new Set([...src.matchAll(/\| '([^']+)'/g)].map((m) => m[1]));
}

describe('action `method:` validity', () => {
  const { names: emitted, literals, unresolved } = emittedMethodIdentifiers();

  it('the scan actually finds emitted method identifiers', () => {
    // Tripwire. If the scan silently matches nothing — directory moved, payload
    // shape changed — the completeness assertion below would vacuously pass.
    expect(emitted.length).toBeGreaterThan(15);
    expect(emitted).toContain('ASSIGN_PARTICIPANT_METHOD');
  });

  /**
   * The reason the AST walk collects what it could NOT resolve. A `method:` whose value
   * is a call, a property access, or an inline string literal is invisible to the
   * completeness check below — so rather than pass silently (the exact failure of the
   * regex this replaced), it fails here and names the file and node kind.
   */
  it('every emitted method value is statically resolvable', () => {
    expect(unresolved).toEqual([]);
  });

  it('inline method literals still name a real engine method', () => {
    const engineMethods = engineMethodNames();
    expect(literals.filter((value) => !engineMethods.has(value))).toEqual([]);
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
