#!/usr/bin/env node
/**
 * verify:publint — package.json correctness + dist health.
 *
 * Replaces `agadoo` (which can't parse esbuild's minified output) with a
 * more comprehensive check that validates:
 *
 *   - `exports` field is well-formed (correct order, types-first, conditional
 *     branches for import/require)
 *   - `main` / `module` / `types` point at files that actually exist in the
 *     packed tarball
 *   - file extensions match their declared format (.mjs/.cjs/.js)
 *   - `sideEffects`, `type`, and other tree-shake / interop hints are present
 *   - the tarball contents match what `files` says will publish
 *
 * Runs in --strict mode so warnings fail the check. Suggestions still print
 * (visibility) but don't block; they're advisory tuning.
 */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FACTORY_ROOT = resolve(__dirname, '../..');

function log(msg) {
  process.stdout.write(`[verify:publint] ${msg}\n`);
}

log('running publint --strict --level warning…');

// Use spawn so we stream stdout/stderr directly; publint writes its full
// report to stdout regardless of exit code, which we want users to see.
const child = spawn('npx', ['--yes', 'publint', '--strict', '--level', 'warning'], {
  cwd: FACTORY_ROOT,
  stdio: 'inherit',
});

child.on('exit', (code) => {
  if (code !== 0) {
    process.stderr.write(
      '\n[verify:publint] FAIL — see warnings above. If a warning is intentional and acceptable, downgrade to `--level error` in scripts/verify/publint.mjs.\n',
    );
    process.exit(code ?? 1);
  }
  log('OK — package.json + dist contents pass publint --strict');
});
