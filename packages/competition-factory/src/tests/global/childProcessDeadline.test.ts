import { readdirSync, readFileSync, statSync } from 'node:fs';
import { expect, it } from 'vitest';
import path from 'node:path';

/**
 * NO CHILD PROCESS WITHOUT A DEADLINE (punch list P62). A blocking child process (`spawnSync`, `execSync`,
 * `execFileSync`) holds its caller's event loop until the child exits. Inside a vitest worker that means no test or
 * hook timeout can fire, so a child that never exits stalls the whole run (gate s6b's `full` arm: ~2.5 h, the kernel
 * stdio adapter waiting on an end of input that never came). In a verify script it stalls the gate that runs it.
 *
 * So every such call in the test harness and the scripts names a `timeout`, which turns a hang into a failure that
 * says which command hung. This reads the source: a call is the text from its name to its closing parenthesis.
 */
const ROOT = path.resolve(__dirname, '../../..');
const SCANNED = ['src/tests', 'scripts'];
const CALL = /\b(spawnSync|execSync|execFileSync)\(/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (entry === 'node_modules' || entry.startsWith('.')) return [];
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(m?[jt]s)$/.test(entry) ? [full] : [];
  });
}

/** the text of the call opened at `start` (the index of its `(`), up to its matching `)` */
function callText(source: string, start: number): string {
  let depth = 0;
  for (let index = start; index < source.length; index++) {
    if (source[index] === '(') depth += 1;
    if (source[index] === ')') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  return source.slice(start);
}

/** every blocking child-process call that names no `timeout`, as `file:line name` */
export function undeadlinedCalls(files: string[], read = (file: string) => readFileSync(file, 'utf8')): string[] {
  return files.flatMap((file) => {
    const source = read(file);
    return [...source.matchAll(CALL)]
      .filter((match) => {
        const before = source.slice(Math.max(0, (match.index ?? 0) - 9), match.index);
        // the import of the name, and this guard's own pattern, are not calls
        const call = callText(source, (match.index ?? 0) + match[0].length - 1);
        // `timeout: n`, or the shorthand `timeout,` / `timeout }`
        return !before.endsWith('import { ') && !/\btimeout\s*[:,}]/.test(call);
      })
      .map((match) => `${path.relative(ROOT, file)}:${source.slice(0, match.index).split('\n').length} ${match[1]}`);
  });
}

it('every blocking child process in the test harness and the scripts names a timeout', () => {
  const files = SCANNED.flatMap((dir) => sourceFiles(path.join(ROOT, dir))).filter(
    (file) => path.basename(file) !== 'childProcessDeadline.test.ts',
  );
  // CONTROL: the scan reads the tree, so an empty result means no offender, not no files
  expect(files.length).toBeGreaterThan(100);
  expect(undeadlinedCalls(files)).toEqual([]);
});

it('CONTROL: the scan finds a call with no timeout, and passes one that has it', () => {
  const sources: Record<string, string> = {
    'bare.ts': "const out = execFileSync('git', ['status'], { encoding: 'utf8' });",
    'nested.ts': 'spawnSync(cmd, { input: f(a, b), maxBuffer: 1 });\nexecSync(`x ${y(1)}`, { timeout: 5_000 });',
    'deadlined.ts': "spawnSync(cmd, {\n  timeout: TIMEOUT,\n  killSignal: 'SIGKILL',\n});",
    'shorthand.ts': "spawnSync(cmd, { encoding: 'utf8', timeout, shell: true });",
  };
  const found = undeadlinedCalls(Object.keys(sources), (file) => sources[file]);
  expect(found.map((entry) => entry.replace(/^.*?([a-z]+\.ts)/, '$1'))).toEqual([
    'bare.ts:1 execFileSync',
    'nested.ts:1 spawnSync',
  ]);
});
