import { readFileSync } from 'node:fs';
import * as tools from '@Assemblies/tools';
import { describe, expect, it } from 'vitest';

/**
 * Each tools domain is also its own package subpath, `tods-competition-factory/tools/<domain>` (CA 2026-11-25), so a
 * consumer of one domain loads no other. postbuild.mjs generates the CJS shims and declarations from the tools barrel;
 * package.json maps the subpaths, and verify:consumer-bundle measures each alone. This keeps the three in step: a new
 * domain without a subpath, or a subpath without a domain, fails here before a build.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const pkg = JSON.parse(read('../../../package.json'));
const domains = Object.keys(tools)
  .filter(
    (name) =>
      tools[name] && typeof tools[name] === 'object' && Object.values(tools[name]).some((v) => typeof v === 'function'),
  )
  .filter((name) => read('../../assemblies/tools/index.ts').includes(`export * as ${name} from './${name}';`))
  .sort();

describe('tools subpaths', () => {
  it('has a domain per subpath and a subpath per domain', () => {
    const subpaths = Object.keys(pkg.exports)
      .filter((key) => key.startsWith('./tools/'))
      .map((key) => key.slice('./tools/'.length))
      .sort();
    expect(domains.length).toBeGreaterThan(5);
    expect(subpaths).toEqual(domains);
  });

  it.each(domains)('tools/%s maps ESM to the domain module, CJS and types to the generated files', (domain) => {
    expect(pkg.exports[`./tools/${domain}`]).toEqual({
      import: { types: `./dist/tools/${domain}.d.mts`, default: `./dist/esm/assemblies/tools/${domain}.mjs` },
      require: { types: `./dist/tools/${domain}.d.cts`, default: `./dist/tools/${domain}.js` },
    });
  });

  it('resolves under node10 through typesVersions', () => {
    expect(pkg.typesVersions['*']['tools/*']).toEqual(['./dist/tools/*.d.ts']);
  });

  it('measures every subpath in verify:consumer-bundle', () => {
    const source = read('../../../scripts/verify/consumerBundle.mjs');
    const listed = source
      .match(/const TOOLS_DOMAINS = \[([^\]]*)\]/)?.[1]
      .match(/'(\w+)'/g)
      ?.map((s) => s.slice(1, -1));
    expect([...(listed ?? [])].sort()).toEqual(domains);
  });
});
