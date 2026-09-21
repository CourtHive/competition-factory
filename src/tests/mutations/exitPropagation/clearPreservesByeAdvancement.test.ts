import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

import { COMPASS, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

/**
 * A BYE advancement is not a result, so clearing a result must not destroy one.
 *
 * `releaseAdvancedDrawPosition` drops a drawPosition from the matchUps that hold it "only by
 * ADVANCEMENT", and its two guards — never the round where the position first appears, only an
 * undecided matchUp — say nothing about HOW the position was advanced. A position a BYE had carried
 * forward at generation therefore looked identical to one a result had delivered, and clearing an
 * unrelated result in the feeding structure took it away.
 *
 * This is CA's ruling of 2026-09-21, the same one `resetDrawDefinition` was corrected under in
 * #4944: reset and clear both undo RESULTS, and a BYE advancement is a consequence of the
 * POSITIONING, which neither of them touches.
 *
 * Found by probe, not by a user: the census reported it as `WINNER_NOT_ADVANCED` two mutations
 * later, because a target missing the position a BYE gave it cannot advance whoever wins there.
 */

const CLEAR = { matchUpStatus: TO_BE_PLAYED, score: { scoreStringSide1: '', scoreStringSide2: '' } };

function compassDraw() {
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

it('a BYE advancement survives the clear of an unrelated result', () => {
  const { find, put } = compassDraw();

  // `West|1|1` is a BYE, so `West|2|1` holds drawPosition 2 in a freshly generated draw — asserted
  // by coordinate, and with the hole read as `undefined` rather than deep-equalled (a hole is
  // `undefined`, which `JSON.stringify` renders as `null`; see docs/concepts/draw-positions.md).
  expect(find('West', 1, 1).matchUpStatus).toEqual('BYE');
  expect(find('West', 2, 1).drawPositions?.[0]).toEqual(2);
  expect(find('West', 2, 1).drawPositions?.[1]).toBeUndefined();

  expect(put('East', 1, 2, { winningSide: 1 }).success).toEqual(true);
  expect(find('West', 2, 1).drawPositions?.[0]).toEqual(2);

  // the clear withdraws the fed loser, and must leave the BYE advancement exactly where it was
  expect(put('East', 1, 2, CLEAR).success).toEqual(true);
  expect(find('West', 2, 1).drawPositions?.[0]).toEqual(2);
  expect(find('West', 2, 1).drawPositions?.[1]).toBeUndefined();
});

it('the same outcome reached two ways leaves the same draw', () => {
  const reach = (clearFirst: boolean) => {
    const { find, put } = compassDraw();
    if (clearFirst) {
      put('East', 1, 2, { winningSide: 1 });
      put('East', 1, 2, CLEAR);
    }
    put('East', 1, 2, { matchUpStatus: DOUBLE_WALKOVER });
    const target = find('West', 2, 1);
    return {
      drawPositions: target.drawPositions,
      matchUpStatus: target.matchUpStatus,
      provenance: target.sideExitProvenance?.[1]?.matchUpStatus,
    };
  };

  // scoring the double walkover directly, and reaching it through a win that was then cleared,
  // must produce the same target. Before the fix the second lost drawPosition 2 and the whole
  // downstream advancement with it.
  expect(reach(true)).toEqual(reach(false));
  expect(reach(true).drawPositions?.[0]).toEqual(2);
});

it('CONTROL: a position advanced by WINNING is still released when that result is cleared', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8, participantsCount: 8, drawId: 'A' }],
    nonRandom: 20223109,
  });
  tournamentEngine.setState(tournamentRecord);
  const find = (roundNumber: number, roundPosition: number) =>
    tournamentEngine
      .allTournamentMatchUps()
      .matchUps.find((m: any) => m.roundNumber === roundNumber && m.roundPosition === roundPosition);

  const first = find(1, 1);
  const advancing = first.drawPositions?.[0];
  const result: any = tournamentEngine.setMatchUpStatus({
    matchUpId: first.matchUpId,
    drawId: 'A',
    outcome: { winningSide: 1 },
  });
  expect(result.success).toEqual(true);
  expect(find(2, 1).drawPositions).toContain(advancing);

  // no BYE anywhere in this draw, so the new guard must not fire and the release must still happen
  tournamentEngine.setMatchUpStatus({ matchUpId: first.matchUpId, drawId: 'A', outcome: CLEAR });
  expect(find(2, 1).drawPositions ?? []).not.toContain(advancing);
});
