import { setOutcomePipeline } from '@Global/state/globalState';
import { afterEach, describe, expect, it } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';

// constants
import { OUTCOME_PIPELINE_V1, OUTCOME_PIPELINE_V2 } from '@Constants/outcomePipelineConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import { MAIN, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

/**
 * A WIN_RATIO structure feeds its playoffs by finishing position, so v1 answers a correction there with the playoff
 * structures it reaches (`checkConnectedStructures`: `connectedStructures` on the result) once the structure is complete.
 * Reading that is a read of the whole structure, which v2 does not take: a winner cleared or changed in a WIN_RATIO
 * structure stays v1's (`link`), and the result is v1's under either pipeline.
 */
afterEach(() => setOutcomePipeline(OUTCOME_PIPELINE_V1));

const CLEARED = { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } };

function correct(mode: OutcomePipelineMode, outcomeOf: (winningSide: number) => any) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawType: ROUND_ROBIN_WITH_PLAYOFF, drawSize: 8, structureOptions: { groupSize: 4 }, drawId: 'd' },
    ],
    completeAllMatchUps: true,
    nonRandom: 1,
    setState: true,
  });
  const [matchUp] = tournamentEngine.allTournamentMatchUps({ contextFilters: { stages: [MAIN] } }).matchUps;
  setOutcomePipeline(mode);
  const { stack: _stack, ...result } = tournamentEngine.setMatchUpStatus({
    outcome: outcomeOf(matchUp.winningSide),
    matchUpId: matchUp.matchUpId,
    drawId: 'd',
  });
  return result;
}

describe('a correction in a completed WIN_RATIO structure returns the playoff structures it reaches', () => {
  it.each([
    ['a cleared result', () => CLEARED],
    [
      'a changed winner',
      (winningSide: number) =>
        mocksEngine.generateOutcomeFromScoreString({ scoreString: '7-5 7-5', winningSide: 3 - winningSide }).outcome,
    ],
  ])('%s', (_label, outcomeOf) => {
    const v1 = correct(OUTCOME_PIPELINE_V1, outcomeOf);
    // CONTROL: v1 reports the playoff structures, so the call exercises the connected structures
    expect(v1.success).toEqual(true);
    expect(v1.connectedStructures).toEqual(true);
    expect(correct(OUTCOME_PIPELINE_V2, outcomeOf)).toEqual(v1);
  });
});
