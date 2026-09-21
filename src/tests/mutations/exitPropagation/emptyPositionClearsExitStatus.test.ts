import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, DEFAULTED } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * An empty drawPosition arriving at a produced exit changes nothing — SIGNAL 1, fixed 2026-09-21.
 *
 * Found by the overnight census 2026-09-20. An empty drawPosition advancing into a matchUp holding
 * a produced exit CLEARED that matchUp's `matchUpStatus` while leaving the `matchUpStatusCodes` and
 * `sideExitProvenance` that describe the exit in place. The matchUp then read TO_BE_PLAYED while
 * simultaneously carrying a per-side record saying side 1 had exited by default.
 *
 * The correct state is the one it already had after step 1: DEFAULTED with NO winningSide — the
 * pending exit, which resolves when a PARTICIPANT arrives. Step 2 delivers no participant (the
 * arriving drawPosition is EMPTY) and so gives no reason to change anything.
 *
 * ## The cause, and why it appeared when it did
 *
 * `drawPositionPlacement` kept a propagated exit's status only when `isExit(status) && winningSide`.
 * CA's Migration §20 ruling of 2026-09-20 — *a pending exit has no `winningSide` until a participant
 * arrives* — removed the very field that test keyed on, so from that day a PENDING propagated exit
 * answered false and had its status cleared. The durable record is the provenance, and the gate now
 * asks that instead; the AWARD stays gated on a participant actually arriving, because *"awarding
 * against an empty slot asserts a winner over an opponent who does not exist"* (CA, 2026-09-20).
 *
 * This file was written as a CHARACTERISATION with a tripwire — *"WHEN THIS IS FIXED the next line
 * fails"* — and the tripwire did its job: it failed on `matchUpStatus`, at the line it named, and
 * the framing below is rewritten rather than the assertion loosened.
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

it('an empty drawPosition arriving at West|2|1 leaves the produced exit exactly as it was', () => {
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

  // ...and so does the status those records describe. Before the fix this read TO_BE_PLAYED: a
  // matchUp asserting that side 1 had already defaulted out of a contest still to be played.
  expect(target.matchUpStatus).toEqual(DEFAULTED);

  // still no winner, and that is the other half of the rule. Nobody arrived — drawPosition 4 is
  // empty — so there is no one to award it to. The award waits for a participant.
  expect(target.winningSide).toBeUndefined();
});
