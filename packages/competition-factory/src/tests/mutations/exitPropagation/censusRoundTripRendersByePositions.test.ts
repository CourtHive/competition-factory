import { projectDraw, projectRoundTrip } from '@Tests/testHarness/exitPropagation/transitions';
import { defined } from '@Tests/helpers/defined';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * WHICH BYE GOES ON IS NOT A ROUND-TRIP DIFFERENCE (census R10, 2026-10-18).
 *
 * When two BYEs meet, one goes on, and which seat it is depends on the order they were placed in. That is
 * not information, and the correction oracle renders a BYE's drawPosition as `BYE`. The round trip read the number, so
 * a probe and its clear that sent the other BYE on reported a residue. The same draw with the other BYE advanced must
 * project the same; the full projection, which still sees the number, is the control.
 */
it('the round trip renders a BYE drawPosition as BYE', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8, participantsCount: 3 }],
  });
  const [{ drawDefinitions }] = defined(tournamentRecord.events, 'events');
  const [drawDefinition] = defined(drawDefinitions, 'drawDefinitions');

  const [structure] = defined(drawDefinition.structures, 'structures');
  const byes = new Set(
    defined(structure.positionAssignments, 'positionAssignments')
      .filter((a: any) => a.bye)
      .map((a: any) => a.drawPosition),
  );
  const byeMeetsBye = defined(structure.matchUps, 'matchUps').find(
    (m: any) => m.roundNumber === 1 && m.drawPositions?.every((dp: any) => byes.has(dp)),
  );
  expect(byeMeetsBye).toBeDefined();
  const [first, second] = defined(defined(byeMeetsBye, 'byeMeetsBye').drawPositions, 'drawPositions');
  const onward = defined(structure.matchUps, 'matchUps').find(
    (m: any) => m.roundNumber === 2 && m.drawPositions?.some((dp: any) => dp === first || dp === second),
  );
  expect(onward).toBeDefined();

  const other = structuredClone(drawDefinition);
  const otherOnward = defined(defined(other.structures, 'structures')[0].matchUps, 'matchUps').find(
    (m: any) => m.matchUpId === defined(onward, 'onward').matchUpId,
  );
  const swapped: Record<number, number> = { [first]: second, [second]: first };
  defined(otherOnward, 'otherOnward').drawPositions = defined(
    defined(otherOnward, 'otherOnward').drawPositions,
    'drawPositions',
  ).map((dp: any) => swapped[dp] ?? dp);

  expect(JSON.stringify(projectDraw(other))).not.toEqual(JSON.stringify(projectDraw(drawDefinition)));
  expect(projectRoundTrip(other)).toEqual(projectRoundTrip(drawDefinition));
});
