#!/usr/bin/env node
/**
 * verify:constants — source, ESM consumer, CJS sourcemaps and declarations must remain constants-only.
 * Type imports erase; fixtures, helpers, the root barrel and all other runtime modules are forbidden.
 * --self-test plants forbidden edges and host reads. Missing build artifacts fail closed.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = join(ROOT, 'src/constants/index.ts');
const ESM = join(ROOT, 'dist/esm/constants/index.mjs');
const LIST = process.argv.includes('--list');

function area(path) {
  const absolute = resolve(ROOT, path);
  for (const base of ['src', 'dist/esm']) {
    const name = relative(join(ROOT, base), absolute).replaceAll('\\', '/');
    if (!name.startsWith('../') && !name.startsWith('/')) return name;
  }
  return path;
}

function violations(modules, text) {
  const result = modules.filter((m) => m !== '<stdin>' && !area(m).startsWith('constants/'));
  for (const name of ['document', 'window', 'process', 'require']) {
    if (new RegExp(`\\b${name}\\s*[.(\\[]`).test(text)) result.push(`host reference: ${name}`);
  }
  return result;
}

async function graph(entry, contents) {
  const result = await build({
    ...(contents === undefined
      ? { entryPoints: [entry] }
      : { stdin: { contents, resolveDir: join(ROOT, 'src/constants'), loader: 'ts' } }),
    absWorkingDir: ROOT,
    tsconfig: join(ROOT, 'tsconfig.json'),
    bundle: true,
    write: false,
    metafile: true,
    format: 'esm',
    platform: 'browser',
    minify: true,
    logLevel: 'silent',
    // Bare Node imports must be visible to the judge rather than failing resolution before it sees the edge.
    plugins: [
      {
        name: 'node-imports',
        setup(plugin) {
          plugin.onResolve({ filter: /^(node:|async_hooks$)/ }, ({ path }) => ({ path, namespace: 'forbidden' }));
          plugin.onLoad({ filter: /.*/, namespace: 'forbidden' }, () => ({ contents: 'export default {};' }));
        },
      },
    ],
  });
  const modules = Object.keys(result.metafile.inputs);
  const text = result.outputFiles[0].text;
  return { modules, text, bad: violations(modules, text) };
}

function report(name, bad, info = '') {
  console.log(`[constants] ${name}: ${bad.length ? `FAIL\n  ${bad.join('\n  ')}` : `OK ${info}`}`);
  return !bad.length;
}

async function selfTest() {
  const plants = {
    root: "import '../index';",
    state: "import '@Global/state/globalState';",
    engine: "import '@Assemblies/engines/sync';",
    helper: "import '@Tools/numeric';",
    fixtures: "import '@Fixtures/index';",
    node: "import 'node:async_hooks';",
    dom: 'console.log(globalThis.document.title);',
  };
  let ok = true;
  for (const [name, plant] of Object.entries(plants)) {
    const result = await graph(SOURCE, `export * from './index'; ${plant}`);
    ok = report(`self-test ${name}`, result.bad.length ? [] : ['planted dependency was not detected']) && ok;
  }
  // A legitimate erased type edge is permitted; the constants barrel itself must also be quiet.
  const clean = await graph(
    SOURCE,
    "export * from './index'; import type { MatchUp } from '@Types/tournamentTypes'; export type { MatchUp };",
  );
  return report('self-test erased type/real entry', clean.bad) && ok;
}

async function verify() {
  let ok = true;
  for (const [name, entry] of [
    ['source', SOURCE],
    ['built ESM', ESM],
  ]) {
    if (!existsSync(entry)) {
      ok = report(name, [`${entry} missing; run pnpm build`]) && ok;
      continue;
    }
    const result = await graph(entry);
    if (LIST)
      console.log(
        result.modules
          .map(area)
          .sort((a, b) => a.localeCompare(b))
          .join('\n'),
      );
    ok =
      report(
        name,
        result.bad,
        `${result.modules.length} modules; ${Buffer.byteLength(result.text)} B min / ${gzipSync(result.text).length} B gzip`,
      ) && ok;
  }
  if (existsSync(ESM)) {
    const result = await build({
      absWorkingDir: ROOT,
      stdin: {
        contents: `import { matchUpStatusConstants } from ${JSON.stringify(ESM)}; console.log(matchUpStatusConstants.COMPLETED);`,
        resolveDir: ROOT,
      },
      bundle: true,
      write: false,
      metafile: true,
      format: 'esm',
      platform: 'browser',
      minify: true,
    });
    const text = result.outputFiles[0].text;
    ok =
      report(
        'minimal browser consumer',
        violations(Object.keys(result.metafile.inputs), text),
        `${Buffer.byteLength(text)} B min / ${gzipSync(text).length} B gzip`,
      ) && ok;
  }
  for (const variant of ['development.cjs.js', 'production.cjs.min.js']) {
    const file = join(ROOT, `dist/constants/constants.${variant}`);
    if (!existsSync(`${file}.map`) || !existsSync(file)) {
      ok = report(`CJS ${variant}`, ['bundle or sourcemap missing; run pnpm build']) && ok;
      continue;
    }
    // Rollup/TypeScript maps use compiler-relative source paths, not paths relative to the final CJS folder.
    const sources = JSON.parse(readFileSync(`${file}.map`, 'utf8')).sources.map((p) => {
      const at = p.lastIndexOf('src/');
      return at === -1 ? p : p.slice(at);
    });
    ok = report(`CJS ${variant}`, violations(sources, readFileSync(file, 'utf8')), `${sources.length} sources`) && ok;
  }
  for (const ext of ['ts', 'mts', 'cts']) {
    const file = join(ROOT, `dist/constants.d.${ext}`);
    const bad = !existsSync(file)
      ? ['declarations missing; run pnpm build']
      : [...readFileSync(file, 'utf8').matchAll(/\b(?:from\s*|import\s*\(?\s*|require\s*\()\s*['"]([^'"]+)['"]/g)].map(
          (m) => `external declaration dependency: ${m[1]}`,
        );
    ok = report(`declarations ${ext}`, bad) && ok;
  }
  return ok;
}

try {
  process.exitCode = (process.argv.includes('--self-test') ? await selfTest() : await verify()) ? 0 : 1;
} catch (error) {
  console.error(`[constants] FAIL: ${error.stack}`);
  process.exitCode = 1;
}
