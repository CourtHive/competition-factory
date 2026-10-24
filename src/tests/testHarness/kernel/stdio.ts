import { directAdapter } from './kernel';
import { readFileSync } from 'node:fs';

/**
 * This implementation behind the external protocol (`externalAdapter`): newline-delimited JSON requests on stdin, one
 * `{ operation, input }` per line, and one result per line on stdout, in order. It is the stand-in that proves the
 * protocol, the batching and the process boundary with an implementation already known to be right; a second
 * implementation speaks the same lines. Bundled and run as its own process by `kernelExternal.test.ts`.
 */
const adapter = directAdapter();
const lines = readFileSync(0, 'utf8').split('\n').filter(Boolean);
const results = lines.map((line) => {
  try {
    const { operation, input } = JSON.parse(line);
    return adapter.invoke(operation, input);
  } catch (error) {
    return { kind: 'refused', reason: 'INVALID_INPUT', detail: error instanceof Error ? error.message : String(error) };
  }
});
process.stdout.write(results.map((result) => JSON.stringify(result)).join('\n') + '\n');
