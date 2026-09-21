import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, DEFAULTED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * CHARACTERISATION of an OPEN defect, found by the overnight census 2026-09-20.
 *
 * An empty drawPosition advancing into a matchUp that holds a produced exit CLEARS that matchUp's
 * `matchUpStatus` while leaving the `matchUpStatusCodes` and `sideExitProvenance` which describe the
 * exit in place. The matchUp then reads TO_BE_PLAYED while simultaneously carrying a per-side record
 * saying side 1 exited by default.
 *
 * The correct state is the one it already had after step 1: DEFAULTED with NO winningSide — the
 * pending exit, which resolves when a PARTICIPANT arrives. Step 2 delivers no participant (the
 * arriving drawPosition is EMPTY) and so gives no reason to change anything.
 *
 * These tests assert what the engine does TODAY. The second one is the defect, and it is written to
 * fail loudly the moment the behaviour is corrected, so the fix cannot land silently.
 *
 * See `Mentat/statuses/2026-09-20-overnight-census-on-a-corrected-harness.md`, "SIGNAL 1".
 */

const seed = {
  drawProfiles: [{ drawType: COMPASS, drawSize: 8, participantsCount: 7, drawId: 'A' }],
  nonRandom: 20220267,
};

function setup() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord(seed);
  tournamentEngine.setState(tournamentRecord);

  const find = (structureName: string, roundNumber: number, roundPosition: number) => {
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    return matchUps.find(
      (m: any) =>
        m.structureName === structureName && m.roundNumber === roundNumber && m.roundPosition === roundPosition,
    );
  };

  const enter = (matchUp: any, matchUpStatus: string) =>
    tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      drawId: matchUp.drawId,
      outcome: { matchUpStatus },
    });

  return { enter, find };
}

it('carries a produced exit into West|2|1 when East|1|2 is a DOUBLE_DEFAULT', () => {
  const { enter, find } = setup();

  expect(enter(find('East', 1, 2), DOUBLE_DEFAULT).success).toEqual(true);

  const target = find('West', 2, 1);
  expect(target.matchUpStatus).toEqual(DEFAULTED);
  expect(target.winningSide).toBeUndefined();
  // the second entry is a HOLE, not a drawPosition — see documentation/docs/concepts/draw-positions.md
  expect(target.drawPositions?.[0]).toEqual(2);
  expect(target.drawPositions?.[1]).toBeUndefined();
  expect(target.sideExitProvenance?.[1]?.previousMatchUpStatus).toEqual(DOUBLE_DEFAULT);
});

it('OPEN DEFECT: an empty drawPosition arriving at West|2|1 clears the status but keeps its provenance', () => {
  const { enter, find } = setup();

  expect(enter(find('East', 1, 2), DOUBLE_DEFAULT).success).toEqual(true);
  expect(enter(find('East', 1, 3), DOUBLE_WALKOVER).success).toEqual(true);

  const target = find('West', 2, 1);

  // the drawPosition arrived, and it is EMPTY — no participant is assigned to it
  expect(target.drawPositions).toEqual([2, 4]);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: 'A' });
  const west = drawDefinition.structures.find((s: any) => s.structureName === 'West');
  const dp4 = west.positionAssignments.find((a: any) => a.drawPosition === 4);
  expect(dp4.participantId).toBeUndefined();
  expect(dp4.bye).toBeUndefined();

  // the exit's records SURVIVE, on the side that exited
  expect(target.sideExitProvenance?.[1]?.matchUpStatus).toEqual(DEFAULTED);
  expect(target.sideExitProvenance?.[1]?.previousMatchUpStatus).toEqual(DOUBLE_DEFAULT);
  expect(target.matchUpStatusCodes?.[0]).toMatchObject({ previousMatchUpStatus: DOUBLE_DEFAULT, sideNumber: 1 });

  // ...but the status that those records describe does NOT. This is the defect: a matchUp that
  // reads "to be played" while asserting that side 1 has already defaulted out of it.
  //
  // WHEN THIS IS FIXED the next line fails. Replace it with `toEqual(DEFAULTED)`, drop the
  // characterisation framing above, and delete SIGNAL 1 from the status note.
  expect(target.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(target.winningSide).toBeUndefined();
});
