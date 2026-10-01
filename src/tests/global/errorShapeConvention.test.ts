import { expect, it } from 'vitest';
import { execSync } from 'node:child_process';

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
