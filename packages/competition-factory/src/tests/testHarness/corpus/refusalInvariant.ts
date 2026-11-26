import allowlist from './refusalAllowlist.json';
import { relative } from 'node:path';
import { getTournamentRecords, readMutationStatus } from '@Global/state/globalState';
import { AsyncLocalStorage } from 'node:async_hooks';
import { generatePatch } from '@Tools/jsonPatch';
import { isDeepStrictEqual } from 'node:util';
import { expect, vi } from 'vitest';

// Inspect the public JSON record, including factory stamps. Objects can be edited in place during
// dispatch, so a reference to the old record cannot serve as the baseline.
const snapshot = () => JSON.stringify(getTournamentRecords() ?? {});
const violations = new Set<string>();
// One bulk item's boundary (src/mutate/bulkItem.ts): the record before and after it, and whether it succeeded.
type ItemBoundary = { before: string; after: string; committed: boolean };
type BulkTrace = { method: string; items: ItemBoundary[] };
type DirectiveBoundary = { method: string; before: string; after: string; pending: boolean; items: ItemBoundary[] };
type QueueTrace = { last?: DirectiveBoundary };
const multiDirective = new AsyncLocalStorage<QueueTrace | undefined>();
const bulkTrace = new AsyncLocalStorage<BulkTrace | undefined>();

function compare(method: string, before: string, after: string, error: any, pending: boolean, unstamped?: boolean) {
  if (after === before) return;
  const [oldRecord, newRecord] = [before, after].map((value) => JSON.parse(value));
  if (unstamped) [oldRecord, newRecord].forEach(removeStamps);
  if (isDeepStrictEqual(oldRecord, newRecord)) return;
  const paths = generatePatch(oldRecord, newRecord).map(({ path }) => path);
  const { testPath, currentTestName } = expect.getState();
  const key = relative(process.cwd(), testPath ?? '') + '::' + currentTestName;
  const code = error.code ?? error;
  const rules: Record<string, { method: string; error: string; pending?: boolean; paths: string[] }[]> =
    allowlist.tests;
  const allowed = rules[key]?.some(
    (rule) =>
      rule.method === method &&
      rule.error === code &&
      (!rule.pending || pending) &&
      paths.length > 0 &&
      paths.every((path) => rule.paths.includes(path.replace(/^\/[^/]+/, ''))),
  );
  if (!allowed) violations.add(`${method} returned ${code} and changed ${paths.join(', ')}`);
}

// The engine's stamp of a modified record (and, under stampScope('modified'), of each modified draw): first-class
// `factory` or the legacy `factory` extension. Owned by a call that committed something.
const FACTORY = 'factory';
function unstamp(element: any) {
  if (!element || typeof element !== 'object') return;
  delete element[FACTORY];
  if (Array.isArray(element.extensions))
    element.extensions = element.extensions.filter((extension: any) => extension?.name !== FACTORY);
}
function removeStamps(records: any) {
  for (const record of Object.values(records ?? {}) as any[]) {
    unstamp(record);
    for (const event of record?.events ?? []) for (const draw of event?.drawDefinitions ?? []) unstamp(draw);
  }
}

// A refused bulk call: each refused item was compared at its own boundary. Here every write made OUTSIDE an item, from
// the call's entry to the first item, between items and after the last, is compared. Once an item has committed, the
// engine's stamp is its write too.
function compareItemized(
  method: string,
  before: string,
  after: string,
  error: any,
  pending: boolean,
  items: ItemBoundary[],
) {
  const committed = items.some((item) => item.committed);
  let previous = before;
  for (const item of items) {
    compare(method, previous, item.before, error, pending, committed);
    previous = item.after;
  }
  compare(method, previous, after, error, pending, committed);
}

function compareCall(
  method: string,
  before: string,
  after: string,
  error: any,
  pending: boolean,
  items: ItemBoundary[],
) {
  if (items.length) compareItemized(method, before, after, error, pending, items);
  else compare(method, before, after, error, pending);
}

// Keep sync results synchronous and wait for async results. Report at the test boundary so the
// engine cannot translate an assertion failure into an ordinary refusal.
function checked<T>(method: string, run: () => T, queueTrace?: QueueTrace): T {
  const pending = readMutationStatus() === true;
  const before = snapshot();
  const trace: BulkTrace = { method, items: [] };
  const finish = (result: any) => {
    if (result?.error) {
      if (queueTrace && result.results?.length) {
        const last = queueTrace.last;
        if (last) compareCall(last.method, last.before, last.after, result.error, last.pending, last.items);
        else violations.add('missing final directive boundary for a refused queue');
      } else compareCall(method, before, snapshot(), result.error, pending, trace.items);
    }
    return result;
  };
  const result = bulkTrace.run(trace, run);
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
  const pending = readMutationStatus() === true;
  const before = snapshot();
  const directive: BulkTrace = { method, items: [] };
  const close = () => {
    trace.last = { method, before, after: snapshot(), pending, items: directive.items };
  };
  try {
    const result = bulkTrace.run(directive, run);
    if (result instanceof Promise) return result.finally(close) as T;
    close();
    return result;
  } catch (error) {
    close();
    throw error;
  }
}

// Record each bulk item's boundary for the call or directive that runs it. A refused item must leave the record
// unchanged; a committed item owns what it wrote.
function traceItem<T>(run: () => T): T {
  const trace = bulkTrace.getStore();
  if (!trace) return run();
  const pending = readMutationStatus() === true;
  const before = snapshot();
  const close = (result: any) => {
    const after = snapshot();
    if (result?.error) compare(trace.method, before, after, result.error, pending);
    trace.items.push({ before, after, committed: !result?.error });
    return result;
  };
  const result = run();
  return result instanceof Promise ? (result.then(close) as T) : close(result);
}

vi.mock('@Mutate/bulkItem', async (original) => {
  const actual = await original<typeof import('@Mutate/bulkItem')>();
  return { ...actual, bulkItem: (run: () => unknown) => traceItem(() => actual.bulkItem(run)) };
});
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
