import { generateOutcomeFromScoreString } from '@Generators/simulation/generateOutcomeFromScoreString';
import { setOutcomePipeline } from '@Global/state/globalState';
import { canonicalJson } from '@Tools/canonicalJson';
import { afterEach, expect, it, vi } from 'vitest';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setClock } from '@Tools/clock';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import type { OutcomePipelineMode } from '@Constants/outcomePipelineConstants';
import {
  OUTCOME_PIPELINE_DIFFERENTIAL,
  OUTCOME_PIPELINE_V1,
  OUTCOME_PIPELINE_V2,
} from '@Constants/outcomePipelineConstants';

/**
 * A SWAP THAT CHANGES WHO MAY ENTER A FIRST_MATCHUP-FED SEAT IS v1's (S4). v2 owns a swap over a FIRST_MATCHUP link only
 * where the flip leaves every feed's eligibility as it was, so the relabel is v1's whole write; where it does not, v1's
 * `reconcileFedLoserEligibility` places the newly eligible loser or reverts the seat to a BYE after the flip, which v2
 * does not plan (`swapFeedsSettled`).
 *
 * FIRST_MATCH_LOSER_CONSOLATION 8 with 7 participants: drawPosition 2 is the BYE, so the round 2 winner from that half
 * reached it without a scored win. Their opponent won round 1 and, losing round 2, was kept out. The flip makes the BYE's
 * beneficiary the loser, who may enter: the seat changes from a BYE to a participant.
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

afterEach(() => {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock();
});

const won = (winningSide: 1 | 2) => generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide }).outcome;

function flipped(mode: OutcomePipelineMode) {
  setOutcomePipeline(OUTCOME_PIPELINE_V1);
  setClock('2026-10-26T00:00:00.000Z');
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, participantsCount: 7, drawType: FIRST_MATCH_LOSER_CONSOLATION, drawId: 'd' }],
    nonRandom: 1,
    setState: true,
  });
  const find = (roundNumber: number, roundPosition: number) =>
    tournamentEngine
      .allDrawMatchUps({ drawId: 'd', inContext: true })
      .matchUps.find(
        (matchUp: any) =>
          matchUp.structureName === 'Main' &&
          matchUp.roundNumber === roundNumber &&
          matchUp.roundPosition === roundPosition,
      );
  tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId: find(1, 2).matchUpId, outcome: won(1) });
  const final = find(2, 1);
  tournamentEngine.setMatchUpStatus({ drawId: 'd', matchUpId: final.matchUpId, outcome: won(2) });
  setOutcomePipeline(mode);
  setClock('2026-10-26T00:01:00.000Z');
  v1Writes.count = 0;
  const { stack: _stack, ...result } = tournamentEngine.setMatchUpStatus({
    allowChangePropagation: true,
    matchUpId: final.matchUpId,
    outcome: won(1),
    drawId: 'd',
  });
  return { result, v1Writes: v1Writes.count, record: canonicalJson(tournamentEngine.getTournament().tournamentRecord) };
}

it('is compared under differential with no divergence, and written by v1 under v2', () => {
  const v1 = flipped(OUTCOME_PIPELINE_V1);
  expect(v1.result.success).toEqual(true);

  const differential = flipped(OUTCOME_PIPELINE_DIFFERENTIAL);
  expect(differential.result).toEqual(v1.result);

  const v2 = flipped(OUTCOME_PIPELINE_V2);
  // v2 abstains: the reconciliation is v1's
  expect(v2.v1Writes).toEqual(1);
  expect(v2.result).toEqual(v1.result);
  expect(v2.record).toEqual(v1.record);
});
