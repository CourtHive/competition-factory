import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A participant arriving at a PENDING propagated exit wins it, and goes on — SIGNAL 1's other half.
 *
 * `drawPositionPlacement` recognised "this matchUp already holds a propagated exit" as
 * `isExit(status) && winningSide`. CA's Migration §20 ruling of 2026-09-20 — *a pending exit has no
 * `winningSide` until a participant arrives* — removed the field that test keyed on, so from that
 * day the check answered false for exactly the state it was written for, and the arrival path was
 * skipped: the status was cleared to TO_BE_PLAYED and nobody was awarded or advanced.
 *
 * The cost is a participant stranded in a matchUp that can never be played. Measured on the
 * exit-propagation matrix, COMPASS 8/7: after an ordinary play-forward the draw ended with ONE
 * unplayed matchUp, holding a real participant opposite a drawPosition fed by a double exit —
 * which advances nobody, so the opponent slot could never fill. `getDrawInconsistencies` rated
 * that draw `valid: true`; `PROPAGATED_EXIT_LOST` exists because of it.
 *
 * The gate now asks the provenance, which is the durable record. The AWARD stays gated on a
 * participant actually arriving — see `emptyPositionClearsExitStatus.test.ts` for the other side of
 * that rule, where an empty drawPosition arrives and correctly changes nothing.
 */

function compass() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: COMPASS, drawSize: 16, participantsCount: 14, drawId: 'A' }],
    nonRandom: 20223109,
  });
  tournamentEngine.setState(tournamentRecord);
  const find = (structureName: string, roundNumber: number, roundPosition: number) =>
    tournamentEngine
      .allTournamentMatchUps()
      .matchUps.find(
        (m: any) =>
          m.structureName === structureName && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
      );
  const put = (structureName: string, roundNumber: number, roundPosition: number, outcome: any) =>
    tournamentEngine.setMatchUpStatus({
      matchUpId: find(structureName, roundNumber, roundPosition).matchUpId,
      drawId: 'A',
      outcome,
    });
  return { find, put };
}

it('awards the arriving participant and advances them onward', () => {
  const { find, put } = compass();

  expect(put('East', 1, 2, { matchUpStatus: DOUBLE_WALKOVER }).success).toEqual(true);

  // the pending exit: carried, recorded, and NOT yet awarded — CA's §20 ruling
  const pending = find('West', 2, 1);
  expect(pending.matchUpStatus).toEqual(WALKOVER);
  expect(pending.winningSide).toBeUndefined();
  expect(pending.sideExitProvenance?.[1]?.previousMatchUpStatus).toEqual(DOUBLE_WALKOVER);

  // these two bring a real participant into the matchUp's other side
  expect(put('East', 1, 4, { winningSide: 1 }).success).toEqual(true);
  expect(put('East', 1, 3, { matchUpStatus: DOUBLE_DEFAULT }).success).toEqual(true);

  const resolved = find('West', 2, 1);
  const arriving = resolved.sides?.find((side: any) => side.sideNumber === 2);
  expect(arriving?.participant?.participantName).toEqual('Thomas Wirt');

  // the exit SURVIVES the arrival and is awarded to the participant who turned up
  expect(resolved.matchUpStatus).toEqual(WALKOVER);
  expect(resolved.winningSide).toEqual(2);

  // ...and the winner goes on. Before the fix this matchUp read TO_BE_PLAYED against an opponent
  // slot fed by a double exit, so it could never be played and he never left it.
  const onward = find('West', 3, 1);
  expect(onward.drawPositions).toContain(arriving?.drawPosition);
  expect(onward.sides?.some((side: any) => side?.participant?.participantName === 'Thomas Wirt')).toEqual(true);
});

it('the draw is clean afterwards, by the checker that could not see this class', () => {
  const { put } = compass();
  put('East', 1, 2, { matchUpStatus: DOUBLE_WALKOVER });
  put('East', 1, 4, { winningSide: 1 });
  put('East', 1, 3, { matchUpStatus: DOUBLE_DEFAULT });

  const { valid, inconsistencies } = tournamentEngine.getDrawInconsistencies({ drawId: 'A' });
  expect(inconsistencies ?? []).toEqual([]);
  expect(valid).toEqual(true);
});
