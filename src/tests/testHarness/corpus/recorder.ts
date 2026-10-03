import { getInvariantViolations } from '../exitPropagation/invariants';
import { factoryVersion } from '@Functions/global/factoryVersion';
import { canonicalHash, canonicalObject } from './hash';
import { generatePatch } from '../../../forge/jsonPatch';
import { randomSource, type SeededRandom } from '@Tools/prng';
import { isCoreMethod } from './coreMethods';
import { setClock } from '@Tools/clock';
import addFormats from 'ajv-formats';
import Ajv from 'ajv';
import fs from 'fs';
import path from 'path';
import {
  getInvokeObserver,
  getSchemaWriteMode,
  getTournamentRecords,
  setInvokeObserver,
  type InvokeEvent,
} from '@Global/state/globalState';

/**
 * Golden corpus C2a: harvest the test suite.
 *
 * Installed by `corpusRecord.ts` when `CORPUS_RECORD=1`. For every test, the first core-method
 * call captures the single tournament record in state as the scenario's initial state; every
 * core-method call after that becomes a step (directive, coordinates, result, patch, hash).
 * The live random stream's state at the first core call and a clock frozen at `beginTest` make
 * the scenario replayable without changing what the test itself does. A test with zero or several tournament records in state at its first
 * core call is skipped and counted, with the reason.
 *
 * A test that moves on to a different record set mid-way yields several scenarios (`/part-N`).
 * Output is one JSONL file per test file under `outDir`, plus `_summary.jsonl` with one line per
 * test file. Nothing here is committed: the output directory is ignored, and the measurements
 * (scenario count, bytes, skips, tests the recorder itself broke) are what this capability exists
 * to produce.
 */
const INVARIANTS = ['PARTICIPANT_DUPLICATED_IN_STRUCTURE', 'BYE_POSITION_WITH_PARTICIPANT'];

export type TestIdentity = {
  file: string;
  name: string;
  seed: number;
  ordinal: number;
  scenarioId?: string;
  source?: { kind: string; ref: string };
};

type Step = {
  directive: any;
  coordinates?: any;
  clockAt?: string;
  seed?: number;
  result: any;
  patch: any[];
  hash: string;
};
type Open = {
  tournamentId: string;
  initial: { record: any; hash: string };
  state: any;
  steps: Step[];
  invariantsHeld: Set<string>;
  seed?: number;
};

export type RecorderStats = {
  file: string;
  tests: number;
  scenarios: number;
  steps: number;
  bytes: number;
  skipped: Record<string, number>;
  invalid: number;
  /** first ajv error per invalid scenario, keyed by its instancePath + keyword, with a count */
  invalidReasons: Record<string, number>;
};

const corpusSchema = JSON.parse(fs.readFileSync('./corpus/corpus.schema.json', { encoding: 'utf8' }));
const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);
const validateScenario = ajv.compile(corpusSchema);

function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'x'
  );
}

function scenarioIdFor(file: string, test: string, ordinal: number, scenarioOrdinal: number): string {
  const fileSlug = file
    .replace(/\.test\.ts$/, '')
    .split('/')
    .map(slug)
    .join('/');
  const run = ordinal > 1 ? `-${ordinal}` : '';
  const part = scenarioOrdinal > 1 ? `/part-${scenarioOrdinal}` : '';
  return `recorded/${fileSlug}/${slug(test)}${run}${part}`;
}

/** `nonRandom` survives engineInvoke's conversion because createSeededRandom tags its function. */
function directiveParams(params: any): any {
  if (!params || typeof params !== 'object') return {};
  const out: any = {};
  for (const [key, value] of Object.entries(params)) {
    if (key === 'activeTournamentId') continue;
    if (typeof value === 'function') {
      if (key === 'random' && typeof (value as any).seed === 'number') out.nonRandom = (value as any).seed;
      continue;
    }
    out[key] = value;
  }
  return canonicalObject(out);
}

function coordinatesFor(record: any, matchUpId: unknown) {
  if (typeof matchUpId !== 'string') return undefined;
  const events = record.events ?? [];
  for (let eventIndex = 0; eventIndex < events.length; eventIndex++) {
    const draws = events[eventIndex].drawDefinitions ?? [];
    for (let drawIndex = 0; drawIndex < draws.length; drawIndex++) {
      const stack = [...(draws[drawIndex].structures ?? [])];
      while (stack.length) {
        const structure = stack.pop();
        for (const matchUp of structure.matchUps ?? []) {
          if (matchUp.matchUpId === matchUpId) {
            return {
              eventIndex,
              drawIndex,
              structureName: structure.structureName ?? structure.stage ?? 'UNNAMED',
              roundNumber: matchUp.roundNumber,
              roundPosition: matchUp.roundPosition,
            };
          }
        }
        if (structure.structures?.length) stack.push(...structure.structures);
      }
    }
  }
  return undefined;
}

export class CorpusRecorder {
  private readonly outDir: string;
  private stepBase = 0;
  private ticks = 0;
  private lastRead = 0;
  private inStep = false;
  private closed: any[] = [];
  private readonly previous: ReturnType<typeof getInvokeObserver>;
  private inObserver = false;
  private test?: TestIdentity;
  private open?: Open;
  private skipReason?: string;
  private pending?: { directive: any; coordinates?: any; clockAt: string; seed?: number };
  private stats = new Map<string, RecorderStats>();

  constructor(options: { outDir: string }) {
    this.outDir = options.outDir;
    fs.mkdirSync(this.outDir, { recursive: true });
    this.previous = getInvokeObserver();
    setInvokeObserver((event) => this.observe(event));
  }

  stop() {
    setInvokeObserver(this.previous);
    setClock();
  }

  /**
   * `scenarioId` and `source` override the recorded-test defaults, for a caller that drives an
   * oracle under the recorder (`oracleSources.ts`) and names its scenarios by cell or seed.
   */
  beginTest(test: TestIdentity) {
    this.test = test;
    this.open = undefined;
    this.closed = [];
    this.pending = undefined;
    this.skipReason = undefined;
    // Between steps the engine reads the live wall clock, which is whatever the test has made it
    // (fake timers included), so clock-relative assertions stay true. Within a step the clock is
    // frozen at the step's base and advances one millisecond per read, so successive stamps stay
    // distinct and a replay that starts each step at its recorded base sees identical values. The
    // recorder's own queries run with ticking suspended. Each step's base is at least one
    // millisecond after the previous step's last read, so stamps never go backwards.
    this.stepBase = 0;
    this.ticks = 0;
    this.lastRead = 0;
    setClock(() => {
      if (!this.inStep) return new Date();
      const value = this.stepBase + (this.inObserver ? this.ticks : this.ticks++);
      this.lastRead = Math.max(this.lastRead, value);
      return new Date(value);
    });
    const file = this.statsFor(test.file);
    file.tests += 1;
  }

  endTest(): void {
    const test = this.test;
    if (!test) return;
    const file = this.statsFor(test.file);
    if (this.open?.steps.length) this.closed.push(this.open);
    let ordinal = 0;
    for (const open of this.closed) {
      ordinal += 1;
      const scenario = this.assemble(test, open, ordinal);
      if (validateScenario(scenario)) {
        const line = JSON.stringify(scenario) + '\n';
        fs.appendFileSync(path.join(this.outDir, `${slug(test.file)}.jsonl`), line);
        file.scenarios += 1;
        file.steps += open.steps.length;
        file.bytes += Buffer.byteLength(line);
      } else {
        file.invalid += 1;
        const first = validateScenario.errors?.[0];
        const where = first ? first.instancePath.replace(/\/\d+/g, '/N') : '';
        const method = first?.instancePath.match(/^\/steps\/(\d+)/)?.[1];
        const via = method === undefined ? '' : ` via ${open.steps[Number(method)]?.directive.method}`;
        const key = first ? `${where} ${first.keyword} ${first.message ?? ''}${via}`.trim() : 'unknown';
        file.invalidReasons[key] = (file.invalidReasons[key] ?? 0) + 1;
      }
    }
    if (!this.closed.length && this.skipReason)
      file.skipped[this.skipReason] = (file.skipped[this.skipReason] ?? 0) + 1;
    this.test = undefined;
    this.open = undefined;
    this.closed = [];
    this.inStep = false;
    setClock();
  }

  /** Write one summary line per test file seen. Call once per worker at the end. */
  flushSummary(): RecorderStats[] {
    const all = [...this.stats.values()];
    for (const stats of all) fs.appendFileSync(path.join(this.outDir, '_summary.jsonl'), JSON.stringify(stats) + '\n');
    this.stats.clear();
    return all;
  }

  private statsFor(file: string): RecorderStats {
    let stats = this.stats.get(file);
    if (!stats) {
      stats = { file, tests: 0, scenarios: 0, steps: 0, bytes: 0, skipped: {}, invalid: 0, invalidReasons: {} };
      this.stats.set(file, stats);
    }
    return stats;
  }

  private observe(event: InvokeEvent): void {
    if (this.inObserver || !this.test || !isCoreMethod(event.methodName)) return;
    this.inObserver = true;
    try {
      if (event.phase === 'before') this.before(event);
      else this.after(event);
    } finally {
      this.inObserver = false;
    }
  }

  private before(event: InvokeEvent): void {
    if (this.skipReason) return;
    if (this.open) {
      const ids = Object.keys(getTournamentRecords() ?? {});
      if (ids.length !== 1 || ids[0] !== this.open.tournamentId) {
        // the test moved on to another record set: close this scenario, start another
        if (this.open.steps.length) this.closed.push(this.open);
        this.open = undefined;
      }
    }
    if (!this.open) {
      const records = getTournamentRecords();
      const ids = Object.keys(records ?? {});
      if (ids.length !== 1) {
        this.skipReason = ids.length === 0 ? 'no-tournament-record' : `tournament-records-${ids.length}`;
        return;
      }
      const state = canonicalObject<any>(records[ids[0]]);
      this.open = {
        tournamentId: ids[0],
        initial: { record: state, hash: canonicalHash(state) },
        state,
        steps: [],
        invariantsHeld: new Set(INVARIANTS.filter((rule) => !this.violates(state, rule))),
      };
      // Record where the live random stream IS, rather than restarting it: a restart changes the
      // test's own behaviour (measured: 11 tests). mulberry32's state is a complete description,
      // so `setRandomSource(state)` at replay continues the identical stream from this call on.
      // When the live source is not seeded (never under vitest), the test's seed is recorded and
      // replay cannot be exact; the scenario says so with the `unseeded` tag.
      const live = randomSource() as SeededRandom;
      this.open.seed = typeof live.state === 'function' ? live.state() : undefined;
    }
    // The directive is captured HERE, from the caller's own params. By `after`, the engine has
    // augmented that object in place with resolved entities (drawDefinition, event, …), and a
    // directive carrying those replays against a stale copy and does nothing.
    // Between two core calls a test may read the clock and draw randomness any number of times
    // (queries, mocks), and a replay makes none of those calls. So each step records where the
    // clock and the random stream stood as the call began, and a replay restores both.
    const live = randomSource() as SeededRandom;
    this.stepBase = Math.max(Date.now(), this.lastRead + 1);
    this.ticks = 0;
    this.inStep = true;
    this.pending = {
      directive: { method: event.methodName, params: directiveParams(event.params) },
      coordinates: coordinatesFor(this.open.state, event.params?.matchUpId),
      clockAt: new Date(this.stepBase).toISOString(),
      seed: typeof live.state === 'function' ? live.state() : undefined,
    };
  }

  private after(event: InvokeEvent): void {
    this.inStep = false;
    const open = this.open;
    if (!open) return;
    const pending = this.pending;
    this.pending = undefined;
    if (!pending) return; // an `after` with no `before` is a call that began before the test did
    const records = getTournamentRecords();
    const record = records?.[open.tournamentId];
    if (!record || Object.keys(records).length !== 1) {
      // the call itself changed the record set (a second tournament added, the record replaced):
      // the step cannot be expressed as a patch on one record. Close without it.
      if (open.steps.length) this.closed.push(open);
      else this.skipReason = 'tournament-records-changed';
      this.open = undefined;
      return;
    }
    const next = canonicalObject<any>(record);
    const result = event.result?.error
      ? { error: event.result.error.code ?? String(event.result.error) }
      : { success: true };
    for (const rule of [...open.invariantsHeld]) if (this.violates(next, rule)) open.invariantsHeld.delete(rule);
    open.steps.push({
      directive: pending.directive,
      ...(pending.coordinates ? { coordinates: pending.coordinates } : {}),
      clockAt: pending.clockAt,
      ...(pending.seed === undefined ? {} : { seed: pending.seed }),
      result,
      patch: generatePatch(open.state, next),
      hash: canonicalHash(next),
    });
    open.state = next;
  }

  // The two invariants the corpus names are structure-level (positionAssignments), so the raw
  // draw definition is enough and no engine query is needed. That matters: this file is loaded by
  // a setup file, and importing the engine here would load every governor before a test's
  // vi.mock is hoisted (measured: 13 tests in 4 files saw the real module instead of their mock).
  private violates(record: any, rule: string): boolean {
    for (const event of record.events ?? []) {
      for (const drawDefinition of event.drawDefinitions ?? []) {
        if (getInvariantViolations({ matchUps: [], drawDefinition }).some((v) => v.rule === rule)) return true;
      }
    }
    return false;
  }

  private assemble(test: TestIdentity, open: Open, scenarioOrdinal: number) {
    const part = scenarioOrdinal > 1 ? `/part-${scenarioOrdinal}` : '';
    return {
      corpusVersion: 1,
      factoryVersion: factoryVersion(),
      schemaWriteMode: getSchemaWriteMode(),
      canonicalization: 'RFC8785',
      scenarioId: test.scenarioId
        ? `${test.scenarioId}${part}`
        : scenarioIdFor(test.file, test.name, test.ordinal, scenarioOrdinal),
      source: test.source ?? { kind: 'recorded-test', ref: `${test.file}::${test.name}` },
      seed: open.seed ?? test.seed,
      clock: open.steps[0]?.clockAt ?? new Date(this.stepBase).toISOString(),
      clockTickMs: 1,
      tags: [test.source ? test.source.kind : 'recorded', ...(open.seed === undefined ? ['unseeded'] : [])],
      initial: open.initial,
      steps: open.steps,
      invariants: [...open.invariantsHeld],
      properties: [],
    };
  }
}
