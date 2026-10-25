import { ScoringEngine } from '@Assemblies/engines/scoring/ScoringEngine';
import { harvestScoringReduce } from '../kernel/harvestScoringReduce';
import { factoryVersion } from '@Functions/global/factoryVersion';
import { getSchemaWriteMode } from '@Global/state/globalState';
import { canonicalHash, canonicalObject } from './hash';
import { canonicalJson } from '@Tools/canonicalJson';
import { setRandomSource } from '@Tools/prng';
import { observable } from './scoringSource';
import { setClock } from '@Tools/clock';

/**
 * Golden corpus SE3: the scoring engine CLASS as a source (ScoringEngine v2 plan, § 3 SE3).
 *
 * The C4b streams drive the pure `createMatchUp`/`addPoint`; the class adds the timeline over them:
 * the nine action types of the spec's § 2, the corrections of § 12.3–12.4 and the save/load/rebuild
 * round trip of § 12.5. A scenario here is a list of engine calls. Each is a directive whose `method`
 * is the class method (or `createScoringEngine`, `reload`, `reloadWithoutTimeline`, the steps the
 * class does not name) and whose `params` name its arguments. Each step's result carries what the call
 * returned and the engine's observable after it: the score, the timeline's shape, the servers, the
 * undo and redo depths and the players on court. A refusal (a throw) is the error
 * `SCORING_INPUT_REFUSED` with the message as context. The last step carries the whole matchUp and the
 * supplementary envelope, so a port can compare its final state in full.
 *
 * Like the C4b streams, a scenario has no tournament record: every step's state hash is the hash of the
 * same constant record, and the manifest pins each step's result (#5511). The clock and the random
 * source are fixed for the whole run (§ 12.7), so a scenario regenerates byte for byte.
 */

export type ScoringAction = { method: string; params?: Record<string, any> };

export const REFUSED = 'SCORING_INPUT_REFUSED';
export const SCORING_CLOCK = '2026-10-01T12:00:00.000Z';
const RECORD = { tournamentId: 'corpus-scoring' };

type Holder = { engine: ScoringEngine; matchUpFormat: string };

/** Save the matchUp and the envelope, then restore both into a fresh engine (spec § 12.5). */
function reload(holder: Holder, withoutTimeline = false) {
  const state: any = holder.engine.getState();
  const supplementary = holder.engine.getSupplementaryState();
  // a legacy point-only record (§ 12.6, 2): the points kept, the timeline gone
  if (withoutTimeline && state.history) delete state.history.entries;
  const loaded = new ScoringEngine({ matchUpFormat: holder.matchUpFormat });
  loaded.setState(state);
  if (!withoutTimeline) loaded.loadSupplementaryState(supplementary);
  holder.engine = loaded;
  return undefined;
}

/** Each directive's call: the class method it names, its params spread into the method's arguments. */
const CALLS: Record<string, (holder: Holder, params: Record<string, any>) => unknown> = {
  addPoint: ({ engine }, params) => engine.addPoint(params),
  addGame: ({ engine }, params) => engine.addGame(params as any),
  addSet: ({ engine }, params) => engine.addSet(params as any),
  endSegment: ({ engine }, params) => engine.endSegment(Object.keys(params).length ? params : undefined),
  setInitialScore: ({ engine }, params) => engine.setInitialScore(params as any),
  setServer: ({ engine }, { side, options }) => engine.setServer(side, options),
  setLineUp: ({ engine }, { sideNumber, lineUp }) => engine.setLineUp(sideNumber, lineUp),
  substitute: ({ engine }, params) => engine.substitute(params as any),
  addChallenge: ({ engine }, params) => engine.addChallenge(params as any),
  addAnnotation: ({ engine }, { data, options }) => engine.addAnnotation(data, options),
  undo: ({ engine }, { count }) => engine.undo(count),
  redo: ({ engine }, { count }) => engine.redo(count),
  editPoint: ({ engine }, { pointIndex, data, options }) => engine.editPoint(pointIndex, data, options),
  removePoint: ({ engine }, { pointIndex, options }) => engine.removePoint(pointIndex, options),
  decoratePoint: ({ engine }, { pointIndex, metadata }) => engine.decoratePoint(pointIndex, metadata),
  reload: (holder) => reload(holder),
  reloadWithoutTimeline: (holder) => reload(holder, true),
};

/** The directives a scenario may hold, besides the engine's creation. */
export const SCORING_DIRECTIVES = new Set(Object.keys(CALLS));

/** What the class shows after a call: the C4b observable and the timeline the class adds over it. */
export function engineObservable(engine: ScoringEngine, returned: unknown, final = false) {
  const state: any = engine.getState();
  const entries: any[] = state.history?.entries ?? [];
  const timeline = entries.map((entry) => ({
    type: entry.type,
    ...(entry.pointIndex === undefined ? {} : { pointIndex: entry.pointIndex }),
    ...(entry.serverCorrection === undefined ? {} : { serverCorrection: entry.serverCorrection }),
  }));
  const players = engine.getActivePlayers();
  return canonicalObject({
    ...(returned === undefined ? {} : { returned }),
    ...(observable(state) as Record<string, unknown>),
    matchUpStatus: state.matchUpStatus,
    timeline,
    servers: (state.history?.points ?? []).map((point: any) => point.server),
    nextServer: engine.getNextServer(),
    undoDepth: engine.getUndoDepth(),
    redoDepth: engine.getRedoDepth(),
    ...(players.side1.length || players.side2.length ? { activePlayers: players } : {}),
    ...(final ? { matchUp: state, supplementary: engine.getSupplementaryState() } : {}),
  });
}

function runStep(holder: Holder, action: ScoringAction) {
  const call = CALLS[action.method];
  if (!call) throw new Error(`no scoring directive "${action.method}"`);
  try {
    return { returned: call(holder, action.params ?? {}) };
  } catch (error: any) {
    return { refused: String(error?.message ?? error) };
  }
}

export type ScoringScenarioArgs = {
  scenarioId: string;
  ref: string;
  matchUpFormat: string;
  competitionFormat?: Record<string, any>;
  actions: ScoringAction[];
  tags?: string[];
  seed?: number;
  clock?: string;
};

/** Run a list of engine calls from a new engine and record each one's result. */
export function scoringEngineScenario(args: ScoringScenarioArgs) {
  const {
    scenarioId,
    ref,
    matchUpFormat,
    competitionFormat,
    actions,
    tags = [],
    seed = 1,
    clock = SCORING_CLOCK,
  } = args;
  const hash = canonicalHash(RECORD);
  setRandomSource(seed);
  setClock(clock);
  try {
    const matchUpId = 'corpus-scoring-matchup';
    const options = { matchUpFormat, matchUpId, ...(competitionFormat ? { competitionFormat } : {}) };
    const holder: Holder = { engine: new ScoringEngine(options), matchUpFormat };
    const steps: any[] = [
      {
        directive: { method: 'createScoringEngine', params: options },
        result: { success: true, value: engineObservable(holder.engine, undefined) },
        patch: [],
        hash,
      },
    ];
    actions.forEach((action, index) => {
      const outcome = runStep(holder, action);
      const final = index === actions.length - 1;
      const result = canonicalObject(
        outcome.refused
          ? { error: REFUSED, context: { message: outcome.refused } }
          : { success: true, value: engineObservable(holder.engine, outcome.returned, final) },
      );
      steps.push({ directive: { method: action.method, params: action.params ?? {} }, result, patch: [], hash });
    });
    // the timeline the calls left, as a reducer case (a record reloaded without its timeline has none)
    const configuration = { matchUpFormat, ...(competitionFormat ? { competitionFormat } : {}) };
    harvestScoringReduce(scenarioId, configuration, (holder.engine.getState() as any).history?.entries);
    return {
      corpusVersion: 1,
      factoryVersion: factoryVersion(),
      schemaWriteMode: getSchemaWriteMode(),
      canonicalization: 'RFC8785',
      scenarioId,
      source: { kind: 'authored', ref },
      seed,
      clock,
      tags: ['scoring', ...tags],
      initial: { record: RECORD, hash },
      steps,
      invariants: [],
      properties: [],
    };
  } finally {
    setRandomSource();
    setClock();
  }
}

/** A slug for a scenario id or tag: lowercase, runs of anything else one hyphen. */
export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * The port contract for a class scenario: run its directives through a new engine and compare every
 * step's result with the one recorded. Returns the steps that differ.
 */
export function replayScoringScenario(scenario: any): { step: number; expected: string; actual: string }[] {
  const [create, ...rest] = scenario.steps;
  const rerun = scoringEngineScenario({
    scenarioId: scenario.scenarioId,
    ref: scenario.source.ref,
    matchUpFormat: create.directive.params.matchUpFormat,
    competitionFormat: create.directive.params.competitionFormat,
    actions: rest.map((step: any) => step.directive),
    seed: scenario.seed,
    clock: scenario.clock,
  });
  const mismatches: { step: number; expected: string; actual: string }[] = [];
  scenario.steps.forEach((step: any, index: number) => {
    const expected = canonicalJson(step.result);
    const actual = canonicalJson(rerun.steps[index]?.result);
    if (actual !== expected)
      mismatches.push({ step: index, expected: expected.slice(0, 200), actual: actual.slice(0, 200) });
  });
  return mismatches;
}
