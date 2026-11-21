import { getTournamentRecords } from '@Global/state/globalState';
import { AsyncLocalStorage } from 'node:async_hooks';
import { vi } from 'vitest';
import { isDeepStrictEqual } from 'node:util';
import { generatePatch } from '@Tools/jsonPatch';

// Inspect the public JSON record, including factory stamps. Objects can be edited in place during
// dispatch, so a reference to the old record cannot serve as the baseline.
const snapshot = () => JSON.stringify(getTournamentRecords() ?? {});
const violations = new Set<string>();
type DirectiveBoundary = { method: string; before: string; after: string };
type QueueTrace = { last?: DirectiveBoundary };
const multiDirective = new AsyncLocalStorage<QueueTrace | undefined>();

function compare(method: string, before: string, after: string, error: any) {
  if (after === before) return;
  const [oldRecord, newRecord] = [before, after].map((value) => JSON.parse(value));
  if (isDeepStrictEqual(oldRecord, newRecord)) return;
  const first = generatePatch(oldRecord, newRecord)[0];
  violations.add(`${method} returned ${error.code ?? error} and changed ${first?.path}`);
}

// Keep sync results synchronous and wait for async results. Report at the test boundary so the
// engine cannot translate an assertion failure into an ordinary refusal.
function checked<T>(method: string, run: () => T, queueTrace?: QueueTrace): T {
  const before = snapshot();
  const finish = (result: any) => {
    if (result?.error) {
      if (queueTrace && result.results?.length) {
        const last = queueTrace.last;
        if (last) compare(last.method, last.before, last.after, result.error);
        else violations.add('missing final directive boundary for a refused queue');
      } else compare(method, before, snapshot(), result.error);
    }
    return result;
  };
  const result = run();
  return result instanceof Promise ? (result.then(finish) as T) : finish(result);
}

function invoke<T>(args: any, run: () => T): T {
  if ((args?.params ?? args)?.rollbackOnError) return run();
  const method = args?.method ?? Object.keys(args ?? {}).find((key) => typeof args[key] === 'function') ?? 'execute';
  return checked(method, run);
}

function queue<T>(directives: any, rollback: boolean | undefined, run: () => T): T {
  if (rollback) return multiDirective.run(undefined, run);
  const multiple = Array.isArray(directives) && directives.length > 1;
  // An earlier successful directive owns its writes and the aggregate queue stamp. In that
  // case check each directive around executeFunction. With no successful prefix also check
  // the public return, after the queue has processed the mutation flag and stamped the record.
  const trace: QueueTrace | undefined = multiple ? {} : undefined;
  return multiDirective.run(trace, () => checked(directives?.[0]?.method ?? 'executionQueue', run, trace));
}

// Retain the last directive independently of how its result reaches the async queue: the
// queue can convert a rejected promise to a refusal after executeFunction returns.
function traceDirective<T>(method: string, run: () => T): T {
  const trace = multiDirective.getStore();
  if (!trace) return run();
  const before = snapshot();
  const close = () => {
    trace.last = { method, before, after: snapshot() };
  };
  try {
    const result = run();
    if (result instanceof Promise) return result.finally(close) as T;
    close();
    return result;
  } catch (error) {
    close();
    throw error;
  }
}

vi.mock('@Assemblies/engines/sync/engineInvoke', async (original) => {
  const actual = await original<typeof import('@Assemblies/engines/sync/engineInvoke')>();
  return {
    ...actual,
    engineInvoke: (...args: Parameters<typeof actual.engineInvoke>) =>
      invoke(args[1], () => actual.engineInvoke(...args)),
  };
});
vi.mock('@Assemblies/engines/async/asyncEngineInvoke', async (original) => {
  const actual = await original<typeof import('@Assemblies/engines/async/asyncEngineInvoke')>();
  return {
    ...actual,
    asyncEngineInvoke: (...args: Parameters<typeof actual.asyncEngineInvoke>) =>
      invoke(args[1], () => actual.asyncEngineInvoke(...args)),
  };
});
vi.mock('@Assemblies/engines/sync/executionQueue', async (original) => {
  const actual = await original<typeof import('@Assemblies/engines/sync/executionQueue')>();
  return {
    ...actual,
    executionQueue: (...args: Parameters<typeof actual.executionQueue>) =>
      queue(args[1], args[2], () => actual.executionQueue(...args)),
  };
});
vi.mock('@Assemblies/engines/async/asyncExecutionQueue', async (original) => {
  const actual = await original<typeof import('@Assemblies/engines/async/asyncExecutionQueue')>();
  return {
    ...actual,
    asyncExecutionQueue: (...args: Parameters<typeof actual.asyncExecutionQueue>) =>
      queue(args[1], args[2], () => actual.asyncExecutionQueue(...args)),
  };
});
vi.mock('@Assemblies/engines/parts/executeMethod', async (original) => {
  const actual = await original<typeof import('@Assemblies/engines/parts/executeMethod')>();
  return {
    ...actual,
    executeFunction: (...args: Parameters<typeof actual.executeFunction>) =>
      traceDirective(args[3], () => actual.executeFunction(...args)),
  };
});

export function assertRefusalsUnchanged() {
  const found = [...violations];
  violations.clear();
  if (found.length) throw new Error(`ERROR_IMPLIES_NO_MUTATION\n${found.join('\n')}`);
}
