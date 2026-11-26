import { generateOutcomeFromScoreString } from '@Scoring/parse/outcomeFromScoreString';
import { objectGraph } from '@Tests/testHarness/outcome/objectGraph';
import { setOutcomePipeline } from '@Global/state/globalState';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants and types
import { CANNOT_CHANGE_WINNING_SIDE, INVALID_MATCHUP_STATUS } from '@Constants/errorConditionConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';
import {
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  RETIRED,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

/**
 * A REFUSAL IS RETURNED AS v1 RETURNS IT: the error, the info, and a context holding the same keys in the same order
 * (v1's `decorateResult` drops an attribute that is undefined), with the stored matchUp where v1 names it. And a call
 * both pipelines refuse is compared under `differential`, which plans it beside its refusal, without a plan being
 * stated for a call that has no route.
 */
afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock();
});

const MODES: OutcomePipelineMode[] = [OUTCOME_PIPELINE_V2, OUTCOME_PIPELINE_DIFFERENTIAL];
const TEAM_DRAW = { drawSize: 4, eventType: TEAM, tieFormatName: DOMINANT_DUO };

type Call = { matchUpId: string; outcome: Record<string, unknown>; params?: Record<string, unknown> };

function generate(drawProfile: Record<string, unknown>) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ ...drawProfile, drawId: 'd' }],
    setState: true,
    nonRandom: 1,
  });
  if (drawProfile.eventType === TEAM)
    expect(
      tournamentEngine.generateLineUps({ useDefaultEventRanking: true, attach: true, drawId: 'd' }).success,
    ).toEqual(true);
}

const stored = () => structuredClone(tournamentEngine.getTournament().tournamentRecord);
const top = () =>
  tournamentEngine.allDrawMatchUps({ drawId: 'd', inContext: true }).matchUps.filter((m: any) => !m.collectionId);
const inRound = (roundNumber: number) => top().find((matchUp: any) => matchUp.roundNumber === roundNumber);

/** the call from a copy of `prepared`: the result as an object graph (its keys, in order, undefined ones too) */
function play(mode: OutcomePipelineMode, prepared: any, { matchUpId, outcome, params }: Call) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  tournamentEngine.setState(structuredClone(prepared));
  setOutcomePipeline(mode);
  setClock('2026-10-25T00:01:00.000Z');
  const { stack: _stack, ...result }: any = tournamentEngine.setMatchUpStatus({
    outcome: structuredClone(outcome),
    drawId: 'd',
    matchUpId,
    ...params,
  });
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  const record = canonicalJson(tournamentEngine.getTournament().tournamentRecord);
  // an object graph: every key in its order, one holding undefined among them
  return { result, graph: objectGraph(result), keys: Object.keys(result.context ?? {}), record };
}

function refusedAlike(prepared: any, call: Call, code: string) {
  const v1 = play(OUTCOME_PIPELINE_V1, prepared, call);
  expect(v1.result.error.code).toEqual(code);
  expect(v1.record).toEqual(canonicalJson(prepared));
  for (const mode of MODES) {
    const actual = play(mode, prepared, call);
    expect([mode, actual.keys]).toEqual([mode, v1.keys]);
    expect(actual.result).toStrictEqual(v1.result);
    expect(actual.graph).toEqual(v1.graph);
    expect(actual.record).toEqual(v1.record);
  }
  return v1;
}

describe("a refusal's context holds the keys v1's holds", () => {
  it.each([
    ['a singles matchUp', { drawSize: 4 }],
    ['a TEAM dual', TEAM_DRAW],
  ])('row 6, nobody assigned: a winner alone on %s names no matchUpStatus', (_label, drawProfile) => {
    generate(drawProfile);
    const prepared = stored();
    const { matchUpId } = inRound(2);
    const bare = refusedAlike(prepared, { matchUpId, outcome: { winningSide: 1 } }, INVALID_MATCHUP_STATUS.code);
    expect(bare.keys).toEqual(['requiredParticipants']);
    const named = { matchUpId, outcome: { matchUpStatus: WALKOVER, winningSide: 1 } };
    expect(refusedAlike(prepared, named, INVALID_MATCHUP_STATUS.code).keys).toEqual([
      'matchUpStatus',
      'requiredParticipants',
    ]);
  });

  // row 14's TEAM clause: a dual whose downstream is active, its auto-calc turned on by a call whose lines project
  // another winner (none). v1 (`handleTeamAutoCalc`) names the stored dual beside the call's winningSide
  it.each([
    ['naming no winner', { matchUpStatus: TO_BE_PLAYED }, ['matchUp']],
    ['naming a winner', { winningSide: 2 }, ['winningSide', 'matchUp']],
    ['an exit naming a winner', { matchUpStatus: WALKOVER, winningSide: 2 }, ['winningSide', 'matchUp']],
  ])('row 14, a decided dual with an active downstream, auto-calc enabled by a call %s', (_label, outcome, keys) => {
    generate(TEAM_DRAW);
    const dual = inRound(1);
    const retired = {
      ...generateOutcomeFromScoreString({ scoreString: '6-1 2-1', winningSide: 1 }).outcome,
      matchUpStatus: RETIRED,
    };
    for (const [matchUpId, given, params] of [
      [dual.matchUpId, retired, { disableAutoCalc: true }],
      // the next dual, one team arrived: an exit awarded there makes the first dual's downstream active
      [dual.winnerMatchUpId, { matchUpStatus: DEFAULTED, winningSide: 2 }, {}],
    ] as const)
      expect(tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId, outcome: given, ...params }).success).toEqual(
        true,
      );
    const call = { matchUpId: dual.matchUpId, outcome, params: { enableAutoCalc: true } };
    const v1 = refusedAlike(stored(), call, CANNOT_CHANGE_WINNING_SIDE.code);
    expect(v1.keys).toEqual(keys);
    expect(v1.result.context.matchUp.matchUpId).toEqual(dual.matchUpId);
  });
});

// rows 14 and 13 on a TEAM dual's own call: v1 refused them in its dispatch, after the dual's own writes (its sides and
// line-ups, announced), so the error left the dual stamped. Asked before those writes, the record is unchanged
describe('a TEAM dual whose winner has played on, given another result, is refused with the record unchanged', () => {
  it.each([
    ['decided by its own call', (dual: any) => [[dual.matchUpId, { winningSide: 2 }]]],
    ['decided by its lines', (dual: any) => [0, 1].map((at) => [dual.tieMatchUps[at].matchUpId, { winningSide: 2 }])],
  ])('%s, the other winner named', (_label, decide) => {
    generate(TEAM_DRAW);
    const [first, second] = top().filter((matchUp: any) => matchUp.roundNumber === 1);
    const played = [
      ...decide(first),
      [second.matchUpId, { winningSide: 1 }],
      [first.winnerMatchUpId, { winningSide: 1 }],
    ];
    for (const [matchUpId, outcome] of played as [string, Record<string, unknown>][])
      expect(tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId, outcome }).success).toEqual(true);
    const call = { matchUpId: first.matchUpId, outcome: { winningSide: 1 } };
    const v1 = refusedAlike(stored(), call, CANNOT_CHANGE_WINNING_SIDE.code);
    expect(v1.keys).toEqual(['winningSide', 'matchUp']);
    expect(v1.result.context.matchUp.matchUpId).toEqual(first.matchUpId);
  });
});

describe('a refused call is compared under the differential without a plan', () => {
  // row 6: the dual's seats hold nobody. A line's double exit is the one shape the planners let through with no route
  it.each([DOUBLE_DEFAULT, DOUBLE_WALKOVER])("a line's %s on a dual nobody has reached", (matchUpStatus) => {
    generate(TEAM_DRAW);
    const prepared = stored();
    const line = inRound(2).tieMatchUps[0];
    refusedAlike(prepared, { matchUpId: line.matchUpId, outcome: { matchUpStatus } }, INVALID_MATCHUP_STATUS.code);
  });
});

/**
 * Row 6's fallthrough clause on a TEAM dual: a status no route accepts as named. A call that turns auto-calc on is
 * dispatched with the winner its lines project, whatever it names, so an exit entered with a winner on a dual whose
 * lines project none is an exit with no winner. v1 refuses it before the dual's own writes (its sides and line-ups),
 * and v2 refuses it by the same request.
 */
describe('an exit no route accepts on a TEAM dual is refused before the dual is written', () => {
  const retired = {
    ...generateOutcomeFromScoreString({ scoreString: '6-1 2-1', winningSide: 2 }).outcome,
    matchUpStatus: RETIRED,
  };

  it.each([
    ['a WALKOVER naming a winner, auto-calc enabled', { matchUpStatus: WALKOVER, winningSide: 2 }, true],
    ['a DEFAULTED naming a winner, auto-calc enabled', { matchUpStatus: DEFAULTED, winningSide: 1 }, true],
    ['a RETIRED with its score and winner, auto-calc enabled', retired, true],
    ['a WALKOVER naming no winner', { matchUpStatus: WALKOVER }, false],
  ])('%s', (_label, outcome, enableAutoCalc) => {
    generate(TEAM_DRAW);
    const prepared = stored();
    const call = { matchUpId: inRound(1).matchUpId, outcome, params: enableAutoCalc ? { enableAutoCalc } : {} };
    const v1 = refusedAlike(prepared, call, INVALID_MATCHUP_STATUS.code);
    expect(v1.result.info).toEqual(`matchUpStatus: ${outcome.matchUpStatus}`);
  });

  // the same exit a route accepts: without the flag the winner named stands
  it.each([['without the flag', {}]])('a WALKOVER naming a winner is accepted %s, alike', (_label, params) => {
    generate(TEAM_DRAW);
    const prepared = stored();
    const call = { matchUpId: inRound(1).matchUpId, outcome: { matchUpStatus: WALKOVER, winningSide: 2 }, params };
    const v1 = play(OUTCOME_PIPELINE_V1, prepared, call);
    expect(v1.result.success).toEqual(true);
    for (const mode of MODES) {
      const actual = play(mode, prepared, call);
      expect(actual.result).toStrictEqual(v1.result);
      expect(actual.record).toEqual(v1.record);
    }
  });

  // carried, auto-calc turned on, lines projecting no winner: refused before anything is written (since
  // 56f04654af), in every mode
  it('a WALKOVER naming a winner, carried with auto-calc enabled, is refused, alike', () => {
    generate(TEAM_DRAW);
    const prepared = stored();
    const params = { enableAutoCalc: true, propagateExitStatus: true };
    const call = { matchUpId: inRound(1).matchUpId, outcome: { matchUpStatus: WALKOVER, winningSide: 2 }, params };
    const v1 = refusedAlike(prepared, call, INVALID_MATCHUP_STATUS.code);
    expect(v1.result.info).toEqual(`matchUpStatus: ${WALKOVER}`);
  });
});
