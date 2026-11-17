import { objectGraph } from '@Tests/testHarness/outcome/objectGraph';
import { setOutcomePipeline } from '@Global/state/globalState';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalJson } from '@Tools/canonicalJson';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants and types
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { INVALID_MATCHUP_STATUS } from '@Constants/errorConditionConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';
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
afterEach(() => setOutcomePipeline(OUTCOME_PIPELINE_V1));

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

describe('a refused call is compared under the differential without a plan', () => {
  // row 6: the dual's seats hold nobody. A line's double exit is the one shape the planners let through with no route
  it.each([DOUBLE_DEFAULT, DOUBLE_WALKOVER])("a line's %s on a dual nobody has reached", (matchUpStatus) => {
    generate(TEAM_DRAW);
    const prepared = stored();
    const line = inRound(2).tieMatchUps[0];
    refusedAlike(prepared, { matchUpId: line.matchUpId, outcome: { matchUpStatus } }, INVALID_MATCHUP_STATUS.code);
  });
});
