// Type-check each leaf in isolation and enforce the boundary on its transitive program.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { relative, resolve, sep } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const contracts = ['types/', 'constants/', 'errors/'];
const formats = 'helpers/matchUpFormatCode/';
const leaves = {
  contracts,
  primitives: [...contracts, 'tools/'],
  formats: [...contracts, 'tools/', formats],
  scoring: [...contracts, 'tools/', formats, 'scoring/', 'fixtures/scoring/outcomes/'],
  ratings: [...contracts, 'tools/', formats, 'helpers/ratings/', 'fixtures/ratings/', 'fixtures/policies/'],
  'draw-topology': [...contracts, 'tools/', 'helpers/drawTopology/', 'validators/isExit.ts'],
};

for (const [leaf, allowed] of Object.entries(leaves)) {
  const config = `scripts/verify/leaves/${leaf}.json`;
  // --listFiles (unlike --listFilesOnly) also checks the program and returns a failure for diagnostics.
  const output = execFileSync(
    resolve(root, 'node_modules/typescript7/bin/tsc'),
    ['-p', config, '--listFiles', '--pretty', 'false'],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 120_000,
      killSignal: 'SIGKILL',
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  const files = output
    .trim()
    .split(/\r?\n/)
    .filter((file) => !file.split(sep).includes('node_modules'));
  const sources = files.map((file) => relative(resolve(root, 'src'), file).split(sep).join('/'));
  const outside = sources.filter(
    (file) => !allowed.some((path) => (path.endsWith('/') ? file.startsWith(path) : file === path)),
  );
  if (!sources.length || outside.length)
    throw new Error(`${leaf}: expected a nonempty isolated program. Unexpected files: ${outside.join(', ')}`);
  console.log(`[verify:leaf-closure] ${leaf}: ${sources.length} source files`);
}
