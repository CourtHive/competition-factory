import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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
 *
 * NO HANG (punch list P62). `spawnSync` holds the vitest worker's event loop, so no test timeout can interrupt a child
 * that never exits; one did, for ~2.5 h, blocked reading a stdin whose end never came. So the batch is written to a
 * file and redirected in (`< file`): the child's input ends by construction, and the protocol on its side is still
 * stdin. And the child is killed after `KERNEL_ADAPTER_TIMEOUT_MS` (default two minutes; the suite's batch takes ~3 s),
 * which turns any other hang into an `exception` for every request, naming the deadline.
 */
export type Request = { operation: string; input: unknown };
export type ExternalAdapter = KernelAdapter & { invokeAll: (requests: Request[]) => KernelResult[] };

const MAX_BUFFER = 1024 * 1024 * 1024;
const TIMEOUT = Number(process.env.KERNEL_ADAPTER_TIMEOUT_MS ?? 120_000);

export function externalAdapter(command: string, name = 'external', timeout = TIMEOUT): ExternalAdapter {
  const invokeAll = (requests: Request[]): KernelResult[] => {
    if (!requests.length) return [];
    const dir = mkdtempSync(path.join(tmpdir(), 'kernel-requests-'));
    const file = path.join(dir, 'requests.ndjson');
    writeFileSync(file, requests.map((request) => JSON.stringify(request)).join('\n') + '\n');
    const run = (() => {
      try {
        return spawnSync(`${command} < "${file}"`, {
          stdio: ['ignore', 'pipe', 'pipe'],
          killSignal: 'SIGKILL',
          maxBuffer: MAX_BUFFER,
          encoding: 'utf8',
          timeout,
          shell: true,
        });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    })();
    const timedOut = run.signal === 'SIGKILL' && (run.error as any)?.code === 'ETIMEDOUT';
    const failure = timedOut
      ? `no answer within ${timeout} ms: ${command}`
      : (run.error?.message ?? (run.status === 0 ? undefined : `exit ${run.status}: ${run.stderr}`));
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
