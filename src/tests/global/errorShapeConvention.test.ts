import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { expect, it } from 'vitest';

/**
 * `ResultType.error` is ONE `ErrorType`, never an array. Two mutations used to return
 * `{ error: errors }` with the whole list (destroyPairEntries, positionSeeds); a client switching
 * on `error.code` saw `undefined`, and the golden corpus recorder, which validates every recorded
 * result, refused the scenario. Both now return the first failure as the error and the list in
 * `context`. This test keeps the shape from coming back: a return of `error: <array variable>` in
 * non-test source fails here, by name.
 */
it('no mutation returns an array as its error', () => {
  // `errors` is the conventional name for a collected list; a literal `[` is the other way to
  // write one. Both forms in a `{ error: … }` return are what this guards against.
  // `errors` passed WHOLE (followed by `,` or `}`), not `errors[0]`; or an array literal
  const pattern = String.raw`\{\s*error:\s*(errors\s*[,}]|\[)`;
  const hits = (() => {
    try {
      return execSync(`grep -rnE '${pattern}' src --include='*.ts' --exclude='*.test.ts' || true`, {
        encoding: 'utf8',
      });
    } catch (err: any) {
      return String(err.stdout ?? '');
    }
  })();
  const offenders = hits
    .split('\n')
    .filter((line) => line && !line.startsWith('src/tests/'))
    .filter((line) => !/errors\.(missingRecord|notFound|invalidTransition)/.test(line)); // a lookup table named `errors`
  expect(offenders).toEqual([]);
});

/**
 * `ResultType.context` is an OBJECT; the human sentence belongs in `info`. Two `setMatchUpState`
 * refusals used to return `context: 'Cannot have Bye with winningSide'`, which the corpus schema
 * (`result.context` is `type: object`) refused. `modifyMatchUpNotice({ context: 'name' })` is a
 * different field on a different call and is left alone: this test looks only at object literals
 * that also carry `error:`.
 */
it('no error result carries a string as its context', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (full.endsWith('.ts') && !full.endsWith('.test.ts') && !full.startsWith('src/tests/')) files.push(full);
    }
  };
  walk('src');
  const offenders: string[] = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!/context: ['"`]/.test(line)) return;
      const window = lines.slice(Math.max(0, i - 4), i + 5).join('\n');
      // `modifyMatchUpNotice({ context: 'name' })` next to an early `error:` return is the other field
      if (/\berror:/.test(window) && !/Notice\(\{/.test(window)) offenders.push(`${file}:${i + 1}`);
    });
  }
  expect(offenders).toEqual([]);
});
