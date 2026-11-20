import { getDifferentialTally, takeVerificationFailures } from '@Mutate/matchUps/outcome/differential';
import { checkArrivalsTrue, checkLoserSeatsDerived } from '@Tests/testHarness/exitPropagation/properties';
import { generateSchedule, prepareDraw, replay, rng, shrink } from '@Tests/testHarness/exitPropagation/sweep';
import { getInvariantViolations } from '@Tests/testHarness/exitPropagation/invariants';
import { v1Writes } from '@Tests/testHarness/outcome/directionCounter';
import { soakDraw } from '@Tests/testHarness/outcome/recordSoakState';
import { migrateTournamentRecord } from '@Mutate/tournaments/migrateTournamentRecord';
import { getOutcomePipeline } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import path from 'node:path';
import fs from 'node:fs';
import {
  checkIntegrity,
  clearOutcome,
  getDrawDefinition,
  getDrawMatchUps,
  hash,
} from '@Tests/testHarness/exitPropagation/transitions';

// constants and types
import { OUTCOME_PIPELINE_DIFFERENTIAL, OUTCOME_PIPELINE_V1 } from '@Constants/outcomePipelineConstants';
import type { ScenarioConfig, Step } from '@Tests/testHarness/exitPropagation/sweep';
import type { PropertyFailure } from '@Tests/testHarness/exitPropagation/transitions';
import type { ReplayStep } from '@Tests/testHarness/exitPropagation/replayTypes';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

/**
 * THE RECORD SOAK: `setMatchUpStatus` on real tournament records, under whatever `OUTCOME_PIPELINE` the run is given.
 *
 * The fixed test corpus is built by the mocks engine, so it holds only the states the generators and the tests' own
 * calls produce. Records built by converters hold others. Two arms, each over every draw of every record of one JSONL
 * shard (`{ tournamentId, provider, record }` per line):
 *
 *  - (a) OWN OUTCOME: each decided matchUp (TEAM duals and their lines included, by the same entry call the TEAM matrix
 *    makes: `setMatchUpStatus({ drawId, matchUpId, outcome })`) is given its stored outcome over itself, and separately
 *    cleared and then given it again. The record is restored before a call whenever an earlier one wrote.
 *  - (b) SEEDED WALKS: the exit-propagation sweep's own `generateSchedule`, `replay` and oracles, with its draw
 *    preparation answered by the record (`loadSoakDraw`, through the test file's mock of the mocks engine).
 *
 * NOTHING HERE ASSERTS ON AN OUTCOME. A divergence, a refusal and a throw are each written as one JSONL line and
 * counted; the reader of the output decides what is a finding. The output names records, draws and matchUps by id and
 * carries statuses and message CLASSES only (`messageClass`), never a record's contents.
 */

/** the mocks engine's `generateTournamentRecord`, as `prepareDraw` calls it: the record under soak, loaded afresh */
export function loadSoakDraw(): { drawIds: string[] } {
  const loaded: any = tournamentEngine.setState(soakDraw.record);
  return { drawIds: loaded?.error || !soakDraw.drawId ? [] : [soakDraw.drawId] };
}
soakDraw.load = loadSoakDraw;

export type SoakOptions = {
  recordsFile: string;
  outDir: string;
  arms: string;
  limit: number;
  offset: number;
  maxBytes: number;
  onlyRecord?: string;
  onlyDraw?: string;
  seedStart: number;
  seeds: number;
  steps: number;
  relational: boolean;
  shrink: boolean;
  wholeRecord: boolean;
  eventsFor: string;
  raw: boolean;
  migrate: boolean;
  flushEvery: number;
};

const number = (name: string, fallback: number) => Number(process.env[name] ?? fallback);

export function soakOptions(): SoakOptions {
  return {
    recordsFile: process.env.SOAK_RECORDS ?? '',
    outDir: process.env.SOAK_OUT ?? '',
    arms: process.env.SOAK_ARM ?? 'a',
    limit: number('SOAK_LIMIT', Infinity),
    offset: number('SOAK_OFFSET', 0),
    maxBytes: number('SOAK_MAX_BYTES', Infinity),
    onlyRecord: process.env.SOAK_RECORD,
    onlyDraw: process.env.SOAK_DRAW,
    seedStart: number('SOAK_SEED_START', 1),
    seeds: number('SOAK_SEEDS', 3),
    steps: number('SOAK_STEPS', 20),
    relational: process.env.SOAK_RELATIONAL !== '0',
    shrink: process.env.SOAK_SHRINK === '1',
    wholeRecord: process.env.SOAK_WHOLE_RECORD === '1',
    eventsFor: process.env.SOAK_EVENTS ?? 'all',
    raw: process.env.SOAK_RAW === '1',
    migrate: process.env.SOAK_MIGRATE === '1',
    flushEvery: number('SOAK_FLUSH', 200),
  };
}

/** one line at a time: a shard is not read whole, and a line may be many megabytes */
export function* readLines(file: string): Generator<string> {
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.alloc(1 << 20);
  let pending: Buffer[] = [];
  try {
    for (;;) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (!read) break;
      let start = 0;
      for (let end = buffer.indexOf(10, start); end !== -1 && end < read; end = buffer.indexOf(10, start)) {
        pending.push(Buffer.from(buffer.subarray(start, end)));
        yield Buffer.concat(pending).toString('utf8');
        pending = [];
        start = end + 1;
      }
      if (start < read) pending.push(Buffer.from(buffer.subarray(start, read)));
    }
    if (pending.length) yield Buffer.concat(pending).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

const NOT_LOADED = 'record did not load';
const NO_FORMAT = 'error:ERR_MISSING_MATCHUP_FORMAT';
const DIVERGENCE = 'outcome pipeline divergence';
const CONSTANT = /^[A-Z][A-Z0-9_]*$/;

/**
 * A message with what identifies its record taken out, so messages can be counted by class: the ids given, every
 * quoted string that is not a key or a constant, id-like tokens and numbers.
 */
export function messageClass(message: string, ids: string[] = []): string {
  let text = message.slice(0, 4000);
  for (const id of ids) if (id && text.includes(id)) text = text.split(id).join('<id>');
  return text
    .replace(/"((?:[^"\\]|\\.)*)"(\s*:)?/g, (whole, body: string, key?: string) =>
      key || CONSTANT.test(body) || body === '<id>' ? whole : '"<s>"',
    )
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f-]{4,}/gi, '<id>')
    .replace(/\b(?=[\w-]*\d)(?=[\w-]*[A-Za-z])[\w-]{8,}\b/g, '<id>')
    .replace(/\d+/g, '<n>')
    .slice(0, 400);
}

type CallOutcome = { result?: any; thrown?: any };

/** ok, a factory error code, a divergence (thrown, or returned by an engine that catches), or another throw */
export function resultClass({ result, thrown }: CallOutcome): { class: string; message?: string } {
  if (thrown !== undefined) {
    const message = String(thrown?.message ?? thrown);
    if (thrown?.name === 'OutcomePipelineDivergence' || message.includes(DIVERGENCE))
      return { class: 'divergence', message };
    return { class: `thrown:${thrown?.name ?? 'Error'}`, message };
  }
  const error = result?.error;
  if (!error) return { class: result?.success ? 'ok' : 'no-result' };
  if (typeof error === 'string')
    return error.includes(DIVERGENCE) ? { class: 'divergence', message: error } : { class: 'caught', message: error };
  return { class: `error:${error.code ?? error.message ?? 'UNKNOWN'}` };
}

type Tally = Record<string, { compared: number; deferred: number }>;

function readTally(): Tally {
  takeVerificationFailures(); // read here, or `getDifferentialTally` throws them
  return getDifferentialTally();
}

function tallyDelta(before: Tally, after: Tally): string[] {
  return Object.keys(after).filter((key) => {
    const [was, is] = [before[key], after[key]];
    return is.compared + is.deferred > (was?.compared ?? 0) + (was?.deferred ?? 0);
  });
}

const ABSTAIN = 'shadow:abstain:';

/**
 * HOW THE CALL WAS OWNED. Under `v2` it is what `decideOutcomeV2` returned (the test file wraps it): `native` (v2's own
 * plan), `recorded` (v1 run on a copy, written by v2), `refused`, or `v1`: the call fell through to v1 on the stored
 * record. Under `differential` v1 always writes, so it is read from what the differential tallied for the call:
 * `owned` where the shadow was applied and compared (native and recorded are not told apart there), `abstain:<reason>`
 * where v2 has no complete plan (the call that falls through under `v2`), `refused`, else `unplanned`.
 */
function ownership(mode: string, decisions: string[], tallied: string[], outcomeClass: string): string {
  if (mode === OUTCOME_PIPELINE_V1) return 'v1';
  if (mode !== OUTCOME_PIPELINE_DIFFERENTIAL) return [...new Set(decisions)].join('+') || 'none';
  if (outcomeClass === 'divergence') return 'diverged';
  const abstained = tallied.filter((key) => key.startsWith(ABSTAIN)).map((key) => key.slice(ABSTAIN.length));
  if (abstained.length) return `abstain:${abstained.join('+')}`;
  if (tallied.includes('shadow:applied')) return 'owned';
  return tallied.includes('refusal') ? 'refused' : 'unplanned';
}

const bump = (map: Record<string, number>, key: string, by = 1) => (map[key] = (map[key] ?? 0) + by);

type DrawContext = {
  tournamentId: string;
  provider: string;
  drawId: string;
  drawType: string;
  eventType: string;
  ids: string[];
};

class Soak {
  readonly mode = getOutcomePipeline();
  readonly differential = this.mode === OUTCOME_PIPELINE_DIFFERENTIAL;
  readonly eventsPath: string;
  readonly summaryPath: string;
  readonly started = Date.now();
  lines: string[] = [];
  tallyStart: Tally = {};
  tallyBefore: Tally = {};
  summary: any = {
    records: 0,
    recordsSkipped: {},
    draws: 0,
    drawsSkipped: {},
    matchUpsSkipped: {},
    verificationFailures: 0,
    arms: {},
    walks: { walks: 0, steps: 0, attempted: 0, accepted: 0, refused: 0, thrown: 0, skipped: 0, findings: {} },
  };

  constructor(readonly options: SoakOptions) {
    const shard = path.basename(options.recordsFile).replace(/\.jsonl$/, '');
    const stem = path.join(options.outDir, `${shard}.${options.arms}.${this.mode}`);
    this.eventsPath = `${stem}.events.jsonl`;
    this.summaryPath = `${stem}.summary.json`;
    fs.mkdirSync(options.outDir, { recursive: true });
    fs.writeFileSync(this.eventsPath, '');
    if (this.differential) this.tallyStart = readTally();
  }

  arm(name: string) {
    return (this.summary.arms[name] ??= { calls: 0, ms: 0, byDrawType: {}, byProvider: {}, owned: {}, v1Wrote: {} });
  }

  /** before a call: the counters a call moves are zeroed */
  begin() {
    soakDraw.decisions.length = 0;
    v1Writes.count = 0;
    if (this.differential) this.tallyBefore = readTally();
  }

  /** after a call: classified, counted and written as one line */
  record(arm: string, context: DrawContext, outcome: CallOutcome, fields: Record<string, unknown>): string {
    const verification = takeVerificationFailures();
    this.summary.verificationFailures += verification.length;
    const classed = resultClass(outcome);
    const tallied = this.differential ? tallyDelta(this.tallyBefore, readTally()) : [];
    const owned = ownership(this.mode, soakDraw.decisions, tallied, classed.class);
    const wrote = v1Writes.count;
    const totals = this.arm(arm);
    totals.calls += 1;
    bump((totals.byDrawType[context.drawType] ??= {}), classed.class);
    bump((totals.byProvider[context.provider] ??= {}), classed.class);
    bump((totals.owned[owned] ??= {}), classed.class);
    bump(totals.v1Wrote, wrote ? 'calls with a v1 write on the stored record' : 'calls with none');
    if (this.options.eventsFor === 'all' || classed.class !== 'ok' || verification.length) {
      const { tournamentId: record, provider, drawId, drawType, eventType, ids } = context;
      const classOfMessage = classed.message === undefined ? undefined : messageClass(classed.message, ids);
      this.lines.push(
        JSON.stringify({
          record,
          provider,
          drawId,
          drawType,
          eventType,
          arm,
          ...fields,
          class: classed.class,
          messageClass: classOfMessage,
          raw: this.options.raw ? classed.message?.slice(0, 2000) : undefined,
          owned,
          v1Writes: wrote,
          tallied: tallied.length ? tallied : undefined,
          verificationFailures: verification.length || undefined,
        }),
      );
    }
    if (this.lines.length >= this.options.flushEvery) this.flush();
    return classed.class;
  }

  note(context: Partial<DrawContext>, fields: Record<string, unknown>) {
    const { tournamentId: record, provider, drawId, drawType } = context;
    this.lines.push(JSON.stringify({ record, provider, drawId, drawType, ...fields }));
  }

  flush() {
    if (this.lines.length) fs.appendFileSync(this.eventsPath, this.lines.join('\n') + '\n');
    this.lines = [];
  }

  finish(extra: Record<string, unknown>) {
    this.flush();
    const seconds = (Date.now() - this.started) / 1000;
    for (const arm of Object.values<any>(this.summary.arms))
      arm.callsPerSecond = arm.ms ? Math.round((arm.calls / arm.ms) * 1e5) / 100 : 0;
    const differentialTally = this.differential ? totalDelta(this.tallyStart, readTally()) : undefined;
    const { recordsFile, outDir: _outDir, ...options } = this.options;
    const summary = {
      shard: path.basename(recordsFile),
      mode: this.mode,
      queryPurity: process.env.QUERY_PURITY ?? 'enforce',
      options,
      seconds,
      ...this.summary,
      differentialTally,
      ...extra,
    };
    fs.writeFileSync(this.summaryPath, JSON.stringify(summary, null, 2) + '\n');
    return summary;
  }
}

function totalDelta(before: Tally, after: Tally): Tally {
  const delta: Tally = {};
  for (const [key, { compared, deferred }] of Object.entries(after)) {
    const was = before[key] ?? { compared: 0, deferred: 0 };
    if (compared > was.compared || deferred > was.deferred)
      delta[key] = { compared: compared - was.compared, deferred: deferred - was.deferred };
  }
  return delta;
}

const isDecided = (matchUp: any) =>
  !!matchUp.winningSide || (!!matchUp.matchUpStatus && matchUp.matchUpStatus !== TO_BE_PLAYED);

/** statuses and winning side only: what the call asked, with nothing of who played */
const paramsSummary = (outcome: any) => ({
  matchUpStatus: outcome.matchUpStatus,
  winningSide: outcome.winningSide,
  sets: outcome.score?.sets?.length ?? 0,
  codes: outcome.matchUpStatusCodes?.length || undefined,
});

const levelOf = (matchUp: any) => {
  if (matchUp.matchUpTieId) return 'line';
  return matchUp.tieMatchUps || matchUp.matchUpType === 'TEAM' ? 'dual' : 'matchUp';
};

/** the record with only the draw's event and draw kept: what a call on the draw reads, at a fraction of the copy */
function reducedRecord(record: any, eventId: string, drawId: string): any {
  return {
    ...record,
    events: (record.events ?? [])
      .filter((event: any) => event.eventId === eventId)
      .map((event: any) => ({
        ...event,
        drawDefinitions: (event.drawDefinitions ?? []).filter((draw: any) => draw.drawId === drawId),
      })),
  };
}

function drawIds(drawDefinition: any, matchUps: any[], context: { tournamentId: string; drawId: string }): string[] {
  const ids = new Set<string>([context.tournamentId, context.drawId]);
  for (const matchUp of matchUps) {
    ids.add(matchUp.matchUpId);
    ids.add(matchUp.structureId);
    for (const side of matchUp.sides ?? []) if (side?.participantId) ids.add(side.participantId);
  }
  for (const structure of drawDefinition?.structures ?? []) ids.add(structure.structureId);
  // longest first, so an id that contains another is replaced whole
  return [...ids].filter((id) => typeof id === 'string' && id.length > 3).sort((a, b) => b.length - a.length);
}

/** ARM (a): each decided matchUp's own outcome over itself, then cleared and given again */
function ownOutcomeArm(soak: Soak, context: DrawContext, matchUps: any[]) {
  const { drawId } = context;
  const pristine = hash(getDrawDefinition(drawId));
  let dirty = false;
  const restore = () => {
    if (dirty) loadSoakDraw();
    dirty = false;
  };
  const call = (op: string, matchUp: any, outcome: any) => {
    // the draw as THIS call finds it: the record as loaded, or what an earlier accepted call (a clear) left
    const found = dirty ? hash(getDrawDefinition(drawId)) : pristine;
    soak.begin();
    const attempt: CallOutcome = {};
    try {
      attempt.result = tournamentEngine.setMatchUpStatus({
        outcome: structuredClone(outcome),
        matchUpId: matchUp.matchUpId,
        drawId,
      });
    } catch (error) {
      attempt.thrown = error ?? 'undefined thrown';
    }
    // AN ERROR CHANGES NOTHING: a refusal that left the draw as it was needs no reload, and one that wrote is a finding
    const refused = attempt.thrown === undefined && !!attempt.result?.error;
    const wroteOnError = refused && hash(getDrawDefinition(drawId)) !== found;
    dirty = dirty || !refused || wroteOnError;
    return soak.record('a', context, attempt, {
      op,
      matchUpId: matchUp.matchUpId,
      matchUpType: matchUp.matchUpType,
      level: levelOf(matchUp),
      params: paramsSummary(outcome),
      wroteOnError: wroteOnError || undefined,
    });
  };
  /**
   * A converted record often holds a score and no matchUpFormat anywhere, and both pipelines refuse a scored outcome
   * there before anything is decided. The stored status and winner are then given without the score, so the matchUp's
   * direction is still exercised.
   */
  const give = (op: string, matchUp: any, stored: any) => {
    if (call(op, matchUp, stored) !== NO_FORMAT) return;
    const { score: _score, ...unscored } = stored;
    restore();
    call(`${op}:no-score`, matchUp, unscored);
  };

  for (const matchUp of matchUps) {
    if (!isDecided(matchUp)) continue;
    if (matchUp.matchUpStatus === BYE) {
      bump(soak.summary.matchUpsSkipped, 'BYE');
      continue;
    }
    const { matchUpStatus, winningSide, score, matchUpStatusCodes } = matchUp;
    const stored = { matchUpStatus, winningSide, score, matchUpStatusCodes };
    restore();
    give('reapply', matchUp, stored);
    restore();
    call('clear', matchUp, clearOutcome);
    // on whatever the clear left: the cleared matchUp, or the same matchUp where the clear was refused
    give('reapply-after-clear', matchUp, stored);
    dirty = true;
  }
}

function baseline(drawId: string, matchUps: any[]): string[] {
  const failing = new Set<string>();
  const ask = (check: () => PropertyFailure[] | { length: number }, name?: string) => {
    try {
      const failures: any = check();
      if (name && failures.length) failing.add(name);
      else for (const failure of failures) failing.add(failure.property);
    } catch {
      failing.add('ORACLE_THROW');
    }
  };
  ask(() => getInvariantViolations({ matchUps, drawDefinition: getDrawDefinition(drawId) }), 'STRUCTURAL_INVARIANT');
  ask(() => checkIntegrity(drawId, '-'));
  ask(() => checkLoserSeatsDerived(drawId));
  ask(() => checkArrivalsTrue(drawId));
  return [...failing];
}

const stepKey = (at: { structureName?: unknown; roundNumber?: unknown; roundPosition?: unknown }) =>
  `${at.structureName}|${at.roundNumber}|${at.roundPosition}`;

/**
 * ARM (b): seeded walks. The schedule is generated on the record, then replayed from the record so the walk is
 * reproducible from (record, draw, seed, steps) alone; every replayed step is written with its index.
 *
 * A step names its target by `structureName|roundNumber|roundPosition`, as the sweep does. On a record where two
 * matchUps share a coordinate (`sharedCoordinates` in the draw's baseline line: the lines of a dual share their
 * dual's) the first is the target, in generation and replay alike; the matchUpId written is the one that coordinate
 * names on the record as loaded.
 */
function walkArm(soak: Soak, context: DrawContext, matchUps: any[]) {
  const { drawId, drawType } = context;
  const byKey = new Map<string, any>();
  for (const matchUp of matchUps) if (!byKey.has(stepKey(matchUp))) byKey.set(stepKey(matchUp), matchUp);
  const failingBefore = baseline(drawId, matchUps);
  soak.note(context, {
    arm: 'b',
    op: 'baseline',
    matchUps: matchUps.length,
    sharedCoordinates: matchUps.length - byKey.size,
    failingBefore,
  });

  const { seedStart, seeds, steps: maxSteps, relational } = soak.options;
  for (let seed = seedStart; seed < seedStart + seeds; seed++) {
    // drawSize 0: the shrinker's smaller-draw pass has no smaller record to try
    const propagateExitStatus = rng(seed)() < 0.5;
    const config: ScenarioConfig = { seed, drawType, drawSize: 0, participantsCount: 0, propagateExitStatus };
    let steps: Step[];
    try {
      if (!prepareDraw(config, drawId)) throw new Error(NOT_LOADED);
      steps = generateSchedule(config, drawId, maxSteps);
    } catch (error: any) {
      soak.record('b', context, { thrown: error ?? 'undefined thrown' }, { op: 'generate', seed });
      continue;
    }

    soak.begin();
    const onStep = ({ index, step, observation, skipped }: ReplayStep) => {
      if (!observation) return soak.note(context, { arm: 'b', op: 'skipped-step', seed, step: index, skipped });
      const target = byKey.get(stepKey(step));
      const attempt: CallOutcome = observation.thrown === undefined ? { result: observation.result } : observation;
      soak.record('b', context, attempt, {
        op: 'step',
        seed,
        step: index,
        propagateExitStatus,
        matchUpId: target?.matchUpId,
        matchUpType: target?.matchUpType,
        level: target ? levelOf(target) : undefined,
        params: paramsSummary(step.outcome),
        wroteOnError: (observation.recordMutated && (!!observation.error || !!observation.thrown)) || undefined,
      });
      soak.begin();
    };
    const began = Date.now();
    const replayed = replay(config, steps, drawId, undefined, undefined, { stopOnFailure: false, relational, onStep });
    soak.arm('b').ms += Date.now() - began;
    soak.summary.verificationFailures += takeVerificationFailures().length;

    const walks = soak.summary.walks;
    walks.walks += 1;
    walks.steps += steps.length;
    for (const key of ['attempted', 'accepted', 'refused', 'thrown', 'skipped'] as const)
      walks[key] += replayed.counts[key];
    for (const finding of replayed.findings) {
      const known = failingBefore.includes(finding.property);
      bump((walks.findings[finding.property] ??= {}), known ? 'failing before the walk' : 'new');
      let shrunk: Step[] | undefined;
      if (soak.options.shrink && !known) shrunk = shrink(config, steps, drawId).steps;
      soak.note(context, {
        arm: 'b',
        op: 'finding',
        seed,
        propagateExitStatus,
        property: finding.property,
        stage: finding.stage,
        step: finding.step,
        matchUpId: finding.matchUpId,
        failingBefore: known,
        probe: finding.probe,
        messageClass: messageClass(finding.detail, context.ids),
        raw: soak.options.raw ? finding.detail.slice(0, 2000) : undefined,
        steps: steps.length,
        shrunk,
      });
    }
  }
}

function soakDrawOf(soak: Soak, base: Omit<DrawContext, 'ids' | 'drawId' | 'drawType' | 'eventType'>, at: any) {
  const { record, event, draw } = at;
  const drawId: string = draw.drawId;
  soakDraw.record = soak.options.wholeRecord ? record : reducedRecord(record, event.eventId, drawId);
  soakDraw.drawId = drawId;
  const partial = { ...base, drawId, drawType: draw.drawType ?? 'UNSPECIFIED', eventType: event.eventType ?? 'NONE' };
  if (!loadSoakDraw().drawIds.length) {
    bump(soak.summary.drawsSkipped, NOT_LOADED);
    return soak.note(partial, { op: 'draw-skipped', reason: NOT_LOADED });
  }
  const matchUps = getDrawMatchUps(drawId);
  if (!matchUps.length) {
    bump(soak.summary.drawsSkipped, 'no matchUps');
    return undefined;
  }
  const context: DrawContext = { ...partial, ids: drawIds(getDrawDefinition(drawId), matchUps, partial) };
  soak.summary.draws += 1;
  if (soak.options.arms.includes('a')) {
    const began = Date.now();
    ownOutcomeArm(soak, context, matchUps);
    soak.arm('a').ms += Date.now() - began;
  }
  if (soak.options.arms.includes('b')) walkArm(soak, context, matchUps);
  return undefined;
}

function selected(options: SoakOptions, line: string, index: number, taken: number): 'take' | 'skip' | 'stop' {
  if (taken >= options.limit) return 'stop';
  if (index < options.offset || Buffer.byteLength(line) > options.maxBytes) return 'skip';
  return 'take';
}

/**
 * SOAK_MIGRATE=1: the record as `migrateTournamentRecord` leaves it, before anything is replayed. That is what the
 * server stores for a record pushed through its provider ingest (`provider-key.controller.ts`); nothing migrates a
 * record on load (`setState` does not, nor the server's fetch path, nor TMX), so the default, the record as stored,
 * is what a record saved any other way meets. A migration that changes something is counted, and one that fails noted.
 */
function migrated(soak: Soak, record: any, context: { tournamentId: string; provider: string }) {
  const before = JSON.stringify(record);
  let failed: string | undefined;
  try {
    const result: any = migrateTournamentRecord({ tournamentRecord: record });
    if (result?.error) failed = result.error?.code ?? 'error';
  } catch (error: any) {
    failed = error?.name ?? 'thrown';
  }
  const migration = (soak.summary.migration ??= { changed: 0, unchanged: 0, failed: 0 });
  if (failed) {
    migration.failed += 1;
    soak.note(context, { op: 'migration-failed', class: failed });
  } else if (JSON.stringify(record) === before) migration.unchanged += 1;
  else migration.changed += 1;
}

/** every draw of every record of the shard; returns the summary it wrote beside the events */
export function runRecordSoak(options: SoakOptions) {
  const soak = new Soak(options);
  let index = -1;
  let taken = 0;
  for (const line of readLines(options.recordsFile)) {
    index += 1;
    const choice = selected(options, line, index, taken);
    if (choice === 'stop') break;
    if (choice === 'skip' || !line.trim()) continue;
    const { tournamentId, provider, record } = JSON.parse(line);
    if (options.onlyRecord && tournamentId !== options.onlyRecord) continue;
    taken += 1;
    if (options.migrate) migrated(soak, record, { tournamentId, provider: provider ?? 'NONE' });
    const base = { tournamentId, provider: provider ?? 'NONE' };
    const draws = (record?.events ?? []).flatMap((event: any) =>
      (event.drawDefinitions ?? []).map((draw: any) => ({ record, event, draw })),
    );
    if (!draws.length) bump(soak.summary.recordsSkipped, 'no draws');
    else soak.summary.records += 1;
    for (const at of draws) {
      if (options.onlyDraw && at.draw.drawId !== options.onlyDraw) continue;
      try {
        tournamentEngine.reset();
        soakDrawOf(soak, base, at);
      } catch (error: any) {
        bump(soak.summary.drawsSkipped, 'harness threw');
        const message = messageClass(String(error?.message ?? error));
        soak.note({ ...base, drawId: at.draw.drawId }, { op: 'draw-error', class: error?.name, messageClass: message });
      }
      soak.flush();
    }
  }
  tournamentEngine.reset();
  soakDraw.record = undefined;
  return soak.finish({ linesRead: index + 1, recordsTaken: taken });
}
