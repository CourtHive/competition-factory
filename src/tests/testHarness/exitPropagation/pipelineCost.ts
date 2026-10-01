import { performance } from 'node:perf_hooks';

/**
 * THE PIPELINE COST RECORDER — assessment gap G15.
 *
 * Counts what one `setMatchUpStatus` asks of the draw: how many times it builds the `matchUpsMap`,
 * hydrates every matchUp, reads a structure's assignments, resolves a matchUp's targets — and WHO
 * asked. The question it answers is CA's, 2026-10-01: *"ensure we're not doubling work that is done
 * elsewhere in the pipeline"*. A caller that rebuilds what the pipeline already holds shows up here
 * as a site with more than one call per `setMatchUpStatus`.
 *
 * This module holds state and arithmetic only. It imports NOTHING from the engine, because the test
 * that uses it replaces engine modules with `vi.mock` factories that import this file — an engine
 * import here would be a cycle through a module that is being replaced.
 *
 * ## What a count means, and what it does not
 *
 * - A call is counted only INSIDE a `setMatchUpStatus` (`enter`/`leave` bracket it). The harness's
 *   own reads between steps — `nextPlayable`, the hash, the invariants — are not the pipeline's and
 *   are not counted.
 * - `nested` marks a call made while another counted function is on the stack: the `getMatchUpsMap`
 *   that `getAllDrawMatchUps` makes for itself, the assignments a hydration reads. Those are a
 *   consequence of the outer call, not a second request by the pipeline; the report keeps them apart.
 * - A `vi.mock` replaces a module's EXPORTS. A call between two functions of the same module never
 *   goes through the export, so `structureAssignedDrawPositions` calling `getPositionAssignments`
 *   beside it is one count, not two. That is the right answer here and it is not an accident.
 * - `ms` is inclusive wall time with the recorder's own stack captures subtracted. It ranks sites;
 *   it is not a benchmark.
 */

export type SiteTally = { calls: number; ms: number };

export type CallRecord = {
  /** which run this `setMatchUpStatus` belongs to */
  label: string;
  arm: string;
  /** position of this call within its run, from 0 */
  index: number;
  /** the outcome entered: a matchUpStatus, or `SCORE` for a bare winningSide */
  outcome: string;
  /** wall time of the whole call, recorder overhead subtracted */
  ms: number;
  sites: Map<string, SiteTally>;
};

export type Site = {
  fn: string;
  inContext: boolean;
  nested: boolean;
  /** the two frames above the counted function, nearest first */
  caller: string;
};

const SEPARATOR = ' | ';

export const siteKey = (site: Site): string =>
  [site.fn, site.inContext ? 'inContext' : '-', site.nested ? 'nested' : 'top', site.caller].join(SEPARATOR);

export const parseSiteKey = (key: string): Site => {
  const [fn, inContext, nested, caller] = key.split(SEPARATOR);
  return { fn, inContext: inContext === 'inContext', nested: nested === 'nested', caller };
};

const state = {
  /** depth of `setMatchUpStatus` — a nested call belongs to the outer record */
  statusDepth: 0,
  /** depth of counted functions currently on the stack */
  countedDepth: 0,
  /** time this recorder has spent capturing stacks, to be subtracted from every enclosing timer */
  overhead: 0,
  current: undefined as CallRecord | undefined,
  records: [] as CallRecord[],
  label: '',
  arm: '',
  index: 0,
};

/** Name the run the next `setMatchUpStatus` calls belong to. */
export function beginRun(arm: string, label: string) {
  state.arm = arm;
  state.label = label;
  state.index = 0;
}

export const takeRecords = (): CallRecord[] => state.records.splice(0);

const outcomeName = (params: any): string => params?.outcome?.matchUpStatus ?? 'SCORE';

/** Wrap `setMatchUpStatus` so that every counted call made inside it lands on one record. */
export function bracketed<T extends (...args: any[]) => any>(original: T): T {
  return ((...args: any[]) => {
    if (state.statusDepth > 0) return original(...args);
    state.statusDepth += 1;
    const record: CallRecord = {
      outcome: outcomeName(args[0]),
      index: state.index++,
      label: state.label,
      sites: new Map(),
      arm: state.arm,
      ms: 0,
    };
    state.current = record;
    const overheadAtStart = state.overhead;
    const started = performance.now();
    try {
      return original(...args);
    } finally {
      record.ms = performance.now() - started - (state.overhead - overheadAtStart);
      state.records.push(record);
      state.current = undefined;
      state.statusDepth -= 1;
    }
  }) as T;
}

/** how many engine frames name a site; `PIPELINE_COST_FRAMES=6` traces a site to whoever is really asking */
const FRAMES = Number(process.env.PIPELINE_COST_FRAMES ?? 2);

const FRAME = /^\s*at (?:async )?(?:(.+?) \()?(?:file:\/\/)?([^()]+?):\d+:\d+\)?$/;

/**
 * The engine frames above the counted function, nearest first, as `function@file`.
 *
 * Line numbers are left out on purpose: the stack is of the TRANSFORMED module, whose lines are not
 * the source's. A function name and a file are stable across a transform and are what a reader
 * greps for. Frames with no source file (`Array.forEach`, `new Promise`) and the recorder's own are
 * skipped, so an arrow passed to `forEach` reads as the function that called `forEach`.
 */
export function callerOf(stack: string | undefined): string {
  const frames: string[] = [];
  for (const line of (stack ?? '').split('\n').slice(1)) {
    const match = FRAME.exec(line);
    if (!match) continue;
    const [, name, file] = match;
    if (!file.includes('/src/') || file.includes('/testHarness/exitPropagation/pipelineCost')) continue;
    const base = file.slice(file.lastIndexOf('/') + 1).replace(/\.ts$/, '');
    const fn = (name ?? '(anonymous)').replace(/^(Object|Module|Array)\./, '');
    frames.push(`${fn}@${base}`);
    if (frames.length === FRAMES) break;
  }
  return frames.join(' < ') || '(no engine frame)';
}

/** a draw or structure read that asks for context is a hydration; these are the three ways to ask */
export const inContextRequested = (params: any): boolean =>
  !!(params?.inContext || params?.nextMatchUps || params?.contextFilters);

/**
 * Wrap one exported function so each call inside a `setMatchUpStatus` is tallied by site.
 * `inContextOf` reads the call's own arguments; a function with no such notion omits it.
 */
export function counted<T extends (...args: any[]) => any>(
  fn: string,
  original: T,
  inContextOf: (...args: any[]) => boolean = () => false,
): T {
  return ((...args: any[]) => {
    const record = state.current;
    if (!record) return original(...args);

    const captureStarted = performance.now();
    const key = siteKey({
      caller: callerOf(new Error('site').stack),
      nested: state.countedDepth > 0,
      inContext: inContextOf(...args),
      fn,
    });
    state.overhead += performance.now() - captureStarted;

    const overheadAtStart = state.overhead;
    const started = performance.now();
    state.countedDepth += 1;
    try {
      return original(...args);
    } finally {
      state.countedDepth -= 1;
      const tally = record.sites.get(key) ?? { calls: 0, ms: 0 };
      tally.calls += 1;
      tally.ms += performance.now() - started - (state.overhead - overheadAtStart);
      record.sites.set(key, tally);
    }
  }) as T;
}

// ---------------------------------------------------------------------------------------------
// arithmetic over the records
// ---------------------------------------------------------------------------------------------

export const median = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export type Selector = (site: Site) => boolean;

/** calls matching `selector` in one `setMatchUpStatus` */
export const callsIn = (record: CallRecord, selector: Selector): number => {
  let total = 0;
  for (const [key, tally] of record.sites) if (selector(parseSiteKey(key))) total += tally.calls;
  return total;
};

export const msIn = (record: CallRecord, selector: Selector): number => {
  let total = 0;
  for (const [key, tally] of record.sites) if (selector(parseSiteKey(key))) total += tally.ms;
  return total;
};

export type Distribution = {
  /** `setMatchUpStatus` calls looked at */
  statusCalls: number;
  total: number;
  median: number;
  worst: number;
  /** the call the worst was read from: `label #index outcome` */
  worstAt: string;
  ms: number;
};

/** calls per `setMatchUpStatus` for one selector: total, median, and the worst call with its name */
export function distribution(records: CallRecord[], selector: Selector): Distribution {
  const perCall = records.map((record) => callsIn(record, selector));
  let worst = 0;
  let worstAt = '-';
  records.forEach((record, i) => {
    if (perCall[i] > worst) {
      worst = perCall[i];
      worstAt = `${record.label} #${record.index} ${record.outcome}`;
    }
  });
  return {
    ms: records.reduce((sum, record) => sum + msIn(record, selector), 0),
    total: perCall.reduce((sum, calls) => sum + calls, 0),
    statusCalls: records.length,
    median: median(perCall),
    worstAt,
    worst,
  };
}

export type SiteRow = Site & {
  total: number;
  /** `setMatchUpStatus` calls in which this site ran at all */
  presentIn: number;
  /** the most times this site ran inside ONE `setMatchUpStatus` */
  worst: number;
  worstAt: string;
  ms: number;
};

/** one row per site, most calls first */
export function siteRows(records: CallRecord[]): SiteRow[] {
  const rows = new Map<string, SiteRow>();
  for (const record of records) {
    for (const [key, tally] of record.sites) {
      const row = rows.get(key) ?? { ...parseSiteKey(key), total: 0, presentIn: 0, worst: 0, worstAt: '-', ms: 0 };
      row.total += tally.calls;
      row.presentIn += 1;
      row.ms += tally.ms;
      if (tally.calls > row.worst) {
        row.worst = tally.calls;
        row.worstAt = `${record.label} #${record.index} ${record.outcome}`;
      }
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.total - a.total || a.caller.localeCompare(b.caller));
}
