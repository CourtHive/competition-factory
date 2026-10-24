import { spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { tmpdir } from 'node:os';
import path from 'node:path';

// types
import type { KernelAdapter, KernelResult } from './kernel';

/**
 * An implementation in another process, reached SYNCHRONOUSLY: the kernel's `invoke` is synchronous and stays so, so a
 * batch of requests crosses in one `spawnSync` call rather than one process per call. The protocol is
 * newline-delimited JSON: one `{ operation, input }` request per line on the command's stdin, one `KernelResult` per
 * line on its stdout, in the same order (`stdio.ts` is this implementation speaking it).
 *
 * The command is run through the shell, so it can be any implementation's own launcher. A command that fails, answers
 * fewer lines than it was sent, or answers a line that is not JSON gives an `exception` for every request it did not
 * answer: never a value.
 */
export type Request = { operation: string; input: unknown };
export type ExternalAdapter = KernelAdapter & { invokeAll: (requests: Request[]) => KernelResult[] };

const MAX_BUFFER = 1024 * 1024 * 1024;

export function externalAdapter(command: string, name = 'external'): ExternalAdapter {
  const invokeAll = (requests: Request[]): KernelResult[] => {
    if (!requests.length) return [];
    const run = spawnSync(command, {
      input: requests.map((request) => JSON.stringify(request)).join('\n') + '\n',
      maxBuffer: MAX_BUFFER,
      encoding: 'utf8',
      shell: true,
    });
    const failure = run.error?.message ?? (run.status === 0 ? undefined : `exit ${run.status}: ${run.stderr}`);
    const lines = (run.stdout ?? '').split('\n').filter(Boolean);
    return requests.map((_request, index): KernelResult => {
      if (failure) return { kind: 'exception', message: failure.slice(0, 500) };
      if (index >= lines.length) return { kind: 'exception', message: `no answer for request ${index}` };
      try {
        return JSON.parse(lines[index]);
      } catch {
        return { kind: 'exception', message: `answer ${index} is not JSON` };
      }
    });
  };
  return { name, invokeAll, invoke: (operation, input) => invokeAll([{ operation, input }])[0] };
}

/**
 * An adapter whose answers to a known set of requests are fetched in one batch, on first use, and served from there:
 * each case still reads as its own test, while the process is started once. A request outside the set is sent alone.
 */
export function batchedAdapter(adapter: ExternalAdapter, requests: Request[]): KernelAdapter {
  const key = (operation: string, input: unknown) => JSON.stringify({ operation, input });
  let answers: Map<string, KernelResult> | undefined;
  return {
    name: adapter.name,
    invoke: (operation, input) => {
      answers ??= new Map(
        adapter
          .invokeAll(requests)
          .map((result, index) => [key(requests[index].operation, requests[index].input), result]),
      );
      return answers.get(key(operation, input)) ?? adapter.invoke(operation, input);
    },
  };
}

/** this implementation as a separate process: `stdio.ts` bundled with the repository's own path aliases */
export function stdioCommand() {
  const outfile = path.join(mkdtempSync(path.join(tmpdir(), 'kernel-stdio-')), 'stdio.mjs');
  buildSync({
    tsconfig: path.resolve(__dirname, '../../../../tsconfig.json'),
    entryPoints: [path.join(__dirname, 'stdio.ts')],
    logLevel: 'warning',
    platform: 'node',
    format: 'esm',
    bundle: true,
    outfile,
  });
  return `"${process.execPath}" "${outfile}"`;
}
