import { PRODUCED_EXIT_POLICY } from '@Tests/testHarness/exitPropagation/producedExitPolicy';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { MODIFIED_FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A PARTICIPANT ARRIVING INTO A FED SEAT WINS THE PENDING EXIT THEY ARRIVE AT.
 *
 * A pending exit holds the produced status and no `winningSide`; the award is made when an opponent
 * arrives. For a seat in a later round that worked. For a FED seat it did not: the participant
 * arrived, was advanced onward, and the matchUp they left was never awarded — because resolving it
 * was gated on a condition about notices that is never true of a position in the round it first
 * appears in. `STALLED_POSITION` then reported a participant whose opponent could never arrive, about
 * somebody already in the next round.
 *
 * MODIFIED_FEED_IN_CHAMPIONSHIP 8/5 at `nonRandom: 268`, the matrix's own cell. 35 of the 176 findings
 * `verify:stall-budget` ratchets were this, across six draw types.
 */
it('awards a pending exit to the participant who arrives into its fed seat', () => {
  setSubscriptions({});
  const drawId = 'fed-arrival';
  mocksEngine.generateTournamentRecord({
    policyDefinitions: PRODUCED_EXIT_POLICY,
    drawProfiles: [{ drawType: MODIFIED_FEED_IN_CHAMPIONSHIP, participantsCount: 5, drawSize: 8, drawId }],
    nonRandom: 268,
    setState: true,
  });

  const find = (structureName: string, roundNumber: number, roundPosition: number): any =>
    (tournamentEngine.allTournamentMatchUps().matchUps ?? []).find(
      (matchUp: any) =>
        matchUp.structureName === structureName &&
        matchUp.roundNumber === roundNumber &&
        matchUp.roundPosition === roundPosition,
    );
  const score = (structureName: string, roundNumber: number, roundPosition: number, outcome: any) => {
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: find(structureName, roundNumber, roundPosition).matchUpId,
      outcome,
      drawId,
    });
    expect(result.success, `${structureName}|${roundNumber}|${roundPosition}`).toEqual(true);
  };

  score('Main', 1, 3, { matchUpStatus: DOUBLE_WALKOVER });

  // CONTROL: the exit is pending — delivered to side 2, nobody on side 1 yet, and no winner
  const pending = find('Consolation', 2, 2);
  expect(pending.matchUpStatus).toEqual(WALKOVER);
  expect(pending.winningSide).toBeUndefined();
  expect(pending.sideExitProvenance?.[2]?.previousMatchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect((pending.sides ?? []).filter((side: any) => side.participantId)).toEqual([]);
  // CONTROL: and the seat is FED — this is its first round, which is the case that was missed
  expect(pending.feedRound).toEqual(true);

  score('Main', 2, 1, { winningSide: 1 });

  const settled = find('Consolation', 2, 2);
  const arrived = (settled.sides ?? []).find((side: any) => side.participantId);

  // 1. somebody arrived, into the fed seat
  expect(arrived?.sideNumber).toEqual(1);
  // 2. and they are awarded the exit they arrived at
  expect(settled.matchUpStatus).toEqual(WALKOVER);
  expect(settled.winningSide, 'the arrival wins the pending exit').toEqual(1);
  // 3. they advance, as they always did — the award was the only thing missing
  const next = find('Consolation', 3, 1);
  expect((next.sides ?? []).map((side: any) => side.participantId)).toContain(arrived.participantId);

  // 4. so nobody is reported as stranded
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { inconsistencies }: any = getDrawInconsistencies({ drawDefinition, drawId });
  expect((inconsistencies ?? []).map((issue: any) => issue.issueType)).toEqual([]);
});
