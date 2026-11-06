import {
  deleteNotices,
  getTournamentRecord,
  setOutcomePipeline,
  setSchemaWriteMode,
  setSubscriptions,
} from '@Global/state/globalState';
import { enableTieAutoCalc as directEnable } from '@Mutate/drawDefinitions/matchUpGovernor/enableTieAutoCalc';
import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { afterEach, expect, it, vi } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import { createSeededRandom } from '@Tools/prng';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants and types
import {
  CANNOT_CHANGE_WINNING_SIDE,
  INVALID_MATCHUP,
  MISSING_DRAW_DEFINITION,
} from '@Constants/errorConditionConstants';
import {
  MODIFY_MATCHUP,
  MODIFY_DRAW_DEFINITION,
  MODIFY_POSITION_ASSIGNMENTS,
  UPDATE_INCONTEXT_MATCHUP,
} from '@Constants/topicConstants';
import { BRIDGE, LEGACY, NATIVE, type SchemaWriteMode } from '@Constants/schemaWriteModeConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';
import { IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';

const writes = vi.hoisted(() => ({ count: 0 }));
vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (original) => {
  const actual: any = await original();
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
      writes.count++;
      return actual.setMatchUpState(...args);
    },
  };
});
const topics = [MODIFY_MATCHUP, MODIFY_DRAW_DEFINITION, MODIFY_POSITION_ASSIGNMENTS, UPDATE_INCONTEXT_MATCHUP];
const outcome = generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 }).outcome;
const cases = [
  'empty-auto',
  'empty-disabled',
  'partial-disabled',
  'manual-winner-no-lines',
  'manual-winner-partial',
  'completed-auto',
  'completed-disabled',
  'completed-manual-opposite',
  'completed-reenabled',
  'completed-manual-opposite-active',
  'completed-disabled-line-reversal',
  'completed-manual-opposite-active-side2',
  'completed-manual-opposite-active-final-complete',
  'completed-manual-opposite-active-final-complete-side2',
  'completed-manual-same-active',
  'completed-manual-same-active-side2',
  'round-robin-manual',
  'line-id',
  'unknown-id',
  'missing-draw-direct',
];
function setup(kind: string) {
  const completed = kind.startsWith('completed');
  mocksEngine.generateTournamentRecord({
    policyDefinitions: { scoring: { requireParticipantsForScoring: false } },
    drawProfiles: [
      {
        drawId: 'd',
        drawSize: 4,
        eventType: TEAM_EVENT,
        ...(kind === 'round-robin-manual' ? { drawType: ROUND_ROBIN } : {}),
        ...(completed ? { completionGoal: 5 } : {}),
      },
    ],
    nonRandom: 461106,
    startDate: '2026-11-06',
    endDate: '2026-11-10',
    setState: true,
  });
  const duals = tournamentEngine
    .allDrawMatchUps({ drawId: 'd', inContext: true })
    .matchUps.filter((m: any) => m.tieMatchUps);
  const dual = completed ? duals.find((m: any) => m.winningSide) : duals.find((m: any) => m.roundNumber === 1);
  if (!dual) throw new Error('no selected dual');
  const enter = (request: any) => {
    const result: any = tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId: dual.matchUpId, ...request });
    if (result.error) throw new Error(`setup refused: ${JSON.stringify(result)}`);
  };
  if (kind.includes('disabled') || kind.includes('manual')) enter({ disableAutoCalc: true });
  if (kind.endsWith('side2')) {
    for (const line of dual.tieMatchUps.filter((m: any) => m.winningSide)) {
      enter({
        matchUpId: line.matchUpId,
        outcome: generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 2 }).outcome,
      });
    }
  }
  if (kind.includes('partial')) enter({ matchUpId: dual.tieMatchUps[0].matchUpId, outcome });
  if (kind.startsWith('manual-winner') || kind === 'round-robin-manual')
    enter({ disableAutoCalc: true, outcome: { winningSide: 2 } });
  const calculatedWinner = kind.endsWith('side2') ? 2 : dual.winningSide;
  if (kind.startsWith('completed-manual-opposite'))
    enter({ disableAutoCalc: true, outcome: { winningSide: 3 - calculatedWinner } });
  if (kind.startsWith('completed-manual-same'))
    enter({ disableAutoCalc: true, outcome: { winningSide: calculatedWinner } });
  if (kind === 'completed-disabled-line-reversal') {
    const line = dual.tieMatchUps.find((m: any) => m.winningSide);
    const changed = generateOutcomeFromScoreString({
      scoreString: '6-1 6-1',
      winningSide: 3 - line.winningSide,
    }).outcome;
    enter({ matchUpId: line.matchUpId, outcome: changed });
  }
  if (kind.includes('active')) {
    const other = duals.find((m: any) => m.roundNumber === 1 && m.matchUpId !== dual.matchUpId);
    enter({ matchUpId: other.matchUpId, disableAutoCalc: true, outcome: { winningSide: 1 } });
    const final = duals.find((m: any) => m.roundNumber === 2);
    const progress = kind.includes('final-complete')
      ? { winningSide: 1 }
      : generateOutcomeFromScoreString({ scoreString: '3-2', matchUpStatus: IN_PROGRESS }).outcome;
    enter({ matchUpId: final.matchUpId, disableAutoCalc: true, outcome: progress });
  }
  if (kind === 'completed-reenabled') {
    enter({ disableAutoCalc: true });
    const result: any = tournamentEngine.enableTieAutoCalc({ drawId: 'd', matchUpId: dual.matchUpId });
    if (result.error) throw new Error(`setup enable refused: ${JSON.stringify(result)}`);
  }
  let matchUpId = dual.matchUpId;
  if (kind === 'line-id') matchUpId = dual.tieMatchUps[0].matchUpId;
  if (kind === 'unknown-id') matchUpId = 'missing';
  return { matchUpId };
}

const owned = new Set(['completed-auto', 'completed-disabled', 'completed-manual-opposite', 'completed-reenabled']);
const guards = new Set(['line-id', 'unknown-id', 'missing-draw-direct']);
const scenarios: { kind: string; schema: SchemaWriteMode }[] = [
  ...cases.map((kind) => ({ kind, schema: NATIVE as SchemaWriteMode })),
  ...([BRIDGE, LEGACY] as const).flatMap((schema) =>
    ['completed-disabled', 'completed-manual-opposite-active'].map((kind) => ({ kind, schema })),
  ),
];

afterEach(() => {
  setClock();
  setOutcomePipeline('v1');
  setSchemaWriteMode(NATIVE);
  setSubscriptions({ subscriptions: {} });
});

function play(kind: string, schema: SchemaWriteMode, mode: OutcomePipelineMode) {
  const priorRandom = Math.random;
  try {
    setOutcomePipeline('v1');
    setSchemaWriteMode(schema);
    setSubscriptions({ subscriptions: {} });
    Math.random = createSeededRandom(461106);
    setClock('2026-11-06T02:10:00.000Z');
    const target = setup(kind);
    const raw = getTournamentRecord(tournamentEngine.getTournamentId());
    const drawDefinition = raw.events[0].drawDefinitions[0];
    const stored = findDrawMatchUp({ drawDefinition, matchUpId: target.matchUpId }).matchUp;
    const storedBefore = canonicalJson(stored ?? null);
    const before = canonicalJson(raw);
    deleteNotices();
    const notices: string[] = [];
    setSubscriptions({
      subscriptions: Object.fromEntries(
        topics.map((topic) => [
          topic,
          (payloads: any[]) => payloads.forEach((payload) => notices.push(`${topic} ${canonicalJson(payload)}`)),
        ]),
      ),
    });
    setClock('2026-11-06T02:11:00.000Z');
    setOutcomePipeline(mode);
    writes.count = 0;
    const results: any[] = [];
    for (let attempt = 0; attempt < (kind.includes('active') ? 2 : 1); attempt++) {
      let result: any =
        kind === 'missing-draw-direct'
          ? directEnable({} as any)
          : tournamentEngine.enableTieAutoCalc({ drawId: 'd', ...target });
      // Stack is diagnostic call-path metadata. Compare every other result field, including the refusal context.
      const { stack: _stack, ...answer } = result;
      results.push(answer);
    }
    return {
      before,
      record: canonicalJson(getTournamentRecord(tournamentEngine.getTournamentId())),
      results: canonicalJson(results),
      answers: results,
      notices,
      writes: writes.count,
      storedBefore,
    };
  } finally {
    Math.random = priorRandom;
  }
}

function refusalFor(kind: string) {
  if (kind === 'missing-draw-direct') return MISSING_DRAW_DEFINITION;
  if (guards.has(kind)) return INVALID_MATCHUP;
  if (kind.startsWith('completed-manual-opposite-active')) return CANNOT_CHANGE_WINNING_SIDE;
  return undefined;
}

it.each(scenarios)('enableTieAutoCalc enters the outcome pipeline: $schema / $kind', ({ kind, schema }) => {
  const v1 = play(kind, schema, 'v1');
  const v2 = play(kind, schema, 'v2');
  const differential = play(kind, schema, 'differential');
  for (const measured of [v2, differential]) {
    expect(measured.record).toEqual(v1.record);
    expect(measured.results).toEqual(v1.results);
    expect(measured.notices).toEqual(v1.notices);
  }
  const error = refusalFor(kind);
  if (error) {
    for (const measured of [v1, v2, differential]) {
      expect(measured.record).toEqual(measured.before);
      expect(measured.notices).toEqual([]);
      for (const answer of measured.answers) {
        expect(answer.error).toEqual(error);
        if (error === CANNOT_CHANGE_WINNING_SIDE) {
          expect(Object.keys(answer.context)).toEqual(['matchUp']);
          expect(canonicalJson(answer.context.matchUp)).toEqual(measured.storedBefore);
        }
      }
    }
  } else {
    for (const answer of v1.answers) expect(answer.success).toBe(true);
  }
  const isOwned = schema === NATIVE && owned.has(kind);
  // Refusal planning precedes the BRIDGE/LEGACY fallback gate as well.
  const refusalOwned = error === CANNOT_CHANGE_WINNING_SIDE;
  expect(v2.writes).toBe(isOwned || refusalOwned ? 0 : v1.writes);
  if (!guards.has(kind)) expect(v1.writes).toBeGreaterThan(0);
});
