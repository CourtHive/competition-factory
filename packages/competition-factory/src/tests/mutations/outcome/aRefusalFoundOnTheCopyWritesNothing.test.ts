import { setOutcomePipeline, setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants
import { EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT } from '@Constants/errorConditionConstants';
import { FIRST_ROUND_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { OUTCOME_PIPELINE_V2 } from '@Constants/outcomePipelineConstants';

/**
 * A refusal changes nothing, even one that is only met downstream. Swapping two first-round positions whose
 * matchUps are decided leaves a participant both in the main structure and in the consolation seat they were sent to
 * as a loser. Reversing the other first-round result then sends that participant to the consolation structure a
 * second time, and the call is refused with `ERR_EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT`.
 *
 * That seat is reached only after the result and the winner's advance are written. Under v2, the whole call is first
 * run on a copy of the record (`outcome/plan/recordedCall.ts`); the copy's refusal is the call's refusal, returned
 * before anything is written to the stored record. Before this, the copy's refusal was dropped, the call was run again
 * on the stored record, and it was refused there over the new result, a cleared advance and a stamped record.
 */

afterEach(() => {
  setSubscriptions({ subscriptions: {} });
  setOutcomePipeline();
});

const played = (winningSide: 1 | 2) => ({
  score: {
    sets: [1, 2].map((setNumber) => ({
      side1Score: winningSide === 1 ? 6 : 2,
      side2Score: winningSide === 1 ? 2 : 6,
      winningSide,
      setNumber,
    })),
  },
  winningSide,
});

function setUp() {
  setSubscriptions({ subscriptions: {} });
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: 'd', drawType: FIRST_ROUND_LOSER_CONSOLATION, drawSize: 16 }],
    setState: true,
  });
  const main = tournamentEngine
    .getEvent({ drawId: 'd' })
    .drawDefinition.structures.find((structure: any) => structure.structureName === 'Main');
  const firstRound = (roundPosition: number) =>
    tournamentEngine
      .allDrawMatchUps({ drawId: 'd', inContext: true })
      .matchUps.find(
        (matchUp: any) =>
          matchUp.structureId === main.structureId &&
          matchUp.roundNumber === 1 &&
          matchUp.roundPosition === roundPosition,
      );
  const score = (roundPosition: number, winningSide: 1 | 2) =>
    tournamentEngine.setMatchUpStatus({
      matchUpId: firstRound(roundPosition).matchUpId,
      outcome: played(winningSide),
      drawId: 'd',
    });

  expect(score(4, 1).success).toEqual(true);
  expect(score(1, 2).success).toEqual(true);
  const swapped = tournamentEngine.swapDrawPositionAssignments({
    structureId: main.structureId,
    drawPositions: [1, 7],
    drawId: 'd',
  });
  expect(swapped.success).toEqual(true);
  return { score };
}

const recordNow = () => structuredClone(tournamentEngine.getTournament().tournamentRecord);

// the suite may run under any mode; each case sets its own, the engine's default among them
it.each([
  ['the default pipeline', undefined],
  ['v2', OUTCOME_PIPELINE_V2],
] as const)('under %s, a loser seat refused downstream leaves the record as it was', (_label, pipeline) => {
  setOutcomePipeline(pipeline);
  const { score } = setUp();
  const before = recordNow();

  const result: any = score(4, 2);

  expect(result.error?.code).toEqual(EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT.code);
  expect(recordNow()).toEqual(before);
});
