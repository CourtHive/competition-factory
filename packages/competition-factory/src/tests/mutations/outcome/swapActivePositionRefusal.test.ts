import { findByCoord, generateDraw, playForward } from '@Tests/testHarness/exitPropagation/routeComparison';
import { getDrawDefinition, hash } from '@Tests/testHarness/exitPropagation/transitions';
import { setOutcomePipeline } from '@Global/state/globalState';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';

// constants
import { OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2 } from '@Constants/outcomePipelineConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { DRAW_POSITION_ACTIVE } from '@Constants/errorConditionConstants';

/**
 * § 2 ROW 26 IS v2's (S4): a swap over a FIRST_MATCHUP link that would place a loser on, or take one off, a fed seat
 * that has played on is refused before anything is written, as v1's `swapWinnerLoser` refuses it
 * (`fedLoserPlacementRefusal`, `relabelledPathFeedRefusal`). v2 asks the same two predicates on its structural index, so
 * under `v2` the refusal is v2's alone: the same error, an untouched record, and v1's writer never asked.
 *
 * Until S4 the code was an apply-stage code, deferred under `differential`; the differential suite now compares it.
 */
const v1Writes = vi.hoisted(() => ({ count: 0 }));
vi.mock('@Mutate/matchUps/matchUpStatus/setMatchUpState', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    setMatchUpState: (...args: any[]) => {
      v1Writes.count += 1;
      return actual.setMatchUpState(...args);
    },
  };
});

afterEach(() => setOutcomePipeline(OUTCOME_PIPELINE_V1));

// FIRST_MATCH_LOSER_CONSOLATION 16 with 13 participants (BYEs, so the link condition can withhold), played through
function flipped(mode: OutcomePipelineMode, drawId: string, roundPosition: number) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  generateDraw(FIRST_MATCH_LOSER_CONSOLATION, drawId, 16, 7001, 13);
  playForward(drawId);
  const target = findByCoord(drawId, { structureName: 'Main', roundNumber: 2, roundPosition });
  const before = hash(getDrawDefinition(drawId));
  setOutcomePipeline(mode);
  v1Writes.count = 0;
  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { winningSide: target.winningSide === 1 ? 2 : 1 },
    allowChangePropagation: true,
    matchUpId: target.matchUpId,
    drawId,
  });
  return { result, unchanged: hash(getDrawDefinition(drawId)) === before, v1Writes: v1Writes.count };
}

describe('a swap meeting a FIRST_MATCHUP-fed seat that has played on is refused by v2 before any op', () => {
  it.each([
    ['the newly eligible loser cannot be placed on the fed seat', 1],
    ['the departing loser cannot take back what they won on the fed seat', 3],
  ])('%s', (_label, roundPosition) => {
    const v1 = flipped(OUTCOME_PIPELINE_V1, `swap-active-v1-${roundPosition}`, roundPosition);
    // CONTROL: v1 refuses, over an untouched draw, through its own writer
    expect(v1.result.error).toEqual(DRAW_POSITION_ACTIVE);
    expect(v1.unchanged).toEqual(true);
    expect(v1.v1Writes).toEqual(1);

    const v2 = flipped(OUTCOME_PIPELINE_V2, `swap-active-v2-${roundPosition}`, roundPosition);
    expect(v2.result.error).toEqual(DRAW_POSITION_ACTIVE);
    expect(v2.unchanged).toEqual(true);
    expect(v2.v1Writes).toEqual(0);
  });
});
