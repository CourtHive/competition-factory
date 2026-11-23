import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';
import {
  getOrderedDrawPositionPairs,
  replaceWithAlternate,
  removeAssignment,
  replaceWithBye,
} from '../../../drawDefinitions/testingUtilities';

// constants
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

/**
 * A DIRECTOR'S REMOVAL LEAVES THE DRAW GENERATION WOULD HAVE BUILT — punch-list P47.
 *
 * Two routes to one occupancy of a FEED_IN_CHAMPIONSHIP 8: Main seats 1, 2, 5, 6 and 8 are BYEs,
 * participants sit on 3 and 7, and seat 4 is empty.
 *
 *  - GENERATED: the BYEs and participants placed onto an empty draw.
 *  - REMOVED: `transitiveByeRemovalFIC.test.ts`'s route — every Main seat made a BYE, alternates
 *    put on 3 and 7, then the director removes seat 4's BYE.
 *
 * On the removal route consolation seat 5 is a BYE that LOST its BYE-meets-BYE pairing — seat 2
 * advanced over it. Removing Main seat 4's BYE empties seat 5; it keeps its advancement into round
 * 2 over seat 4's BYE (P46), and it now faces BYEs in rounds 2 and 3. Generation carries such a
 * seat through both. The removal used to leave it in round 2.
 */

function generatedRoute() {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FEED_IN_CHAMPIONSHIP, drawSize: 8, participantsCount: 8, automated: false }],
  });
  tournamentEngine.setState(tournamentRecord);
  const [main, consolation] = tournamentEngine.getEvent({ drawId }).drawDefinition.structures;
  const participantIds = tournamentRecord.participants.map((participant: any) => participant.participantId);

  for (const drawPosition of [1, 8, 2, 5, 6]) {
    const result: any = tournamentEngine.assignDrawPosition({
      structureId: main.structureId,
      bye: true,
      drawPosition,
      drawId,
    });
    expect(result.success).toEqual(true);
  }
  for (const [index, drawPosition] of [3, 7].entries()) {
    const result: any = tournamentEngine.assignDrawPosition({
      participantId: participantIds[index],
      structureId: main.structureId,
      drawPosition,
      drawId,
    });
    expect(result.success).toEqual(true);
  }
  return { drawId, main, consolation };
}

function removalRoute() {
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: FEED_IN_CHAMPIONSHIP, participantsCount: 8, alternatesCount: 10, drawSize: 8 }],
  });
  tournamentEngine.setState(tournamentRecord);
  const [main, consolation] = tournamentEngine.getEvent({ drawId }).drawDefinition.structures;
  const structureId = main.structureId;

  for (const drawPosition of [1, 8, 3, 2, 4, 7, 6, 5]) replaceWithBye({ drawId, structureId, drawPosition });
  for (const drawPosition of [3, 7]) replaceWithAlternate({ drawId, structureId, drawPosition });
  return { drawId, main, consolation };
}

const pairs = (structureId: string) => getOrderedDrawPositionPairs({ structureId }).filteredOrderedPairs;

/**
 * The pairs with every BYE seat rendered `BYE`. When two BYEs meet, which seat number advances
 * depends on the order they were placed and carries no information (CA, 2026-09-29) — the deep
 * correction oracle renders them the same way. An EMPTY seat keeps its number, so the seat P47 is
 * about stays fully visible.
 */
const byeBlindPairs = (drawId: string, structureIndex: number) => {
  const structure = tournamentEngine.getEvent({ drawId }).drawDefinition.structures[structureIndex];
  const byes = new Set(
    structure.positionAssignments.filter((assignment: any) => assignment.bye).map((a: any) => a.drawPosition),
  );
  return pairs(structure.structureId).map((pair: number[]) =>
    pair.map((drawPosition) => (byes.has(drawPosition) ? 'BYE' : drawPosition)),
  );
};
const consolationByes = (drawId: string): number[] =>
  tournamentEngine
    .getEvent({ drawId })
    .drawDefinition.structures[1].positionAssignments.filter((assignment: any) => assignment.bye)
    .map((assignment: any) => assignment.drawPosition)
    .sort((a: number, b: number) => a - b);

it('removing a BYE leaves the draw generation builds for the same occupancy', () => {
  const generated = generatedRoute();
  // read now: building the second route replaces the engine's state
  const generatedMain = byeBlindPairs(generated.drawId, 0);
  const generatedConsolation = byeBlindPairs(generated.drawId, 1);
  const generatedByes = consolationByes(generated.drawId);

  const removed = removalRoute();
  // CONTROL: before the removal consolation seat 5 is a BYE, and it is NOT the one carried onward
  expect(consolationByes(removed.drawId)).toContain(5);
  expect(pairs(removed.consolation.structureId).slice(4)).toEqual([
    [2, 6],
    [1, 6],
  ]);

  removeAssignment({ drawId: removed.drawId, structureId: removed.main.structureId, drawPosition: 4 });

  expect(byeBlindPairs(removed.drawId, 0)).toEqual(generatedMain);
  expect(byeBlindPairs(removed.drawId, 1)).toEqual(generatedConsolation);
  expect(consolationByes(removed.drawId)).toEqual(generatedByes);
  // the seat P47 names: emptied, and carried through rounds 2 and 3 — to meet seat 1, which waits
  // for the Main final's loser
  expect(generatedConsolation.slice(4)).toEqual([
    [5, 'BYE'],
    [1, 5],
  ]);
});
