import { projectDraw, projectRoundTrip } from '@Tests/testHarness/exitPropagation/transitions';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * WHICH BYE GOES ON IS NOT A ROUND-TRIP DIFFERENCE (census R10, 2026-10-18; CA, 2026-09-29).
 *
 * When two BYEs meet, one goes on, and which seat it is depends on the order they were placed in. CA ruled that this is
 * not information, and the correction oracle renders a BYE's drawPosition as `BYE`. The round trip read the number, so
 * a probe and its clear that sent the other BYE on reported a residue. The same draw with the other BYE advanced must
 * project the same; the full projection, which still sees the number, is the control.
 */
it('the round trip renders a BYE drawPosition as BYE', () => {
  const {
    tournamentRecord: {
      events: [
        {
          drawDefinitions: [drawDefinition],
        },
      ],
    },
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: SINGLE_ELIMINATION, drawSize: 8, participantsCount: 3 }],
  });

  const [structure] = drawDefinition.structures;
  const byes = new Set(structure.positionAssignments.filter((a: any) => a.bye).map((a: any) => a.drawPosition));
  const byeMeetsBye = structure.matchUps.find(
    (m: any) => m.roundNumber === 1 && m.drawPositions?.every((dp: any) => byes.has(dp)),
  );
  expect(byeMeetsBye).toBeDefined();
  const [first, second] = byeMeetsBye.drawPositions;
  const onward = structure.matchUps.find(
    (m: any) => m.roundNumber === 2 && m.drawPositions?.some((dp: any) => dp === first || dp === second),
  );
  expect(onward).toBeDefined();

  const other = structuredClone(drawDefinition);
  const otherOnward = other.structures[0].matchUps.find((m: any) => m.matchUpId === onward.matchUpId);
  const swapped: Record<number, number> = { [first]: second, [second]: first };
  otherOnward.drawPositions = otherOnward.drawPositions.map((dp: any) => swapped[dp] ?? dp);

  expect(JSON.stringify(projectDraw(other))).not.toEqual(JSON.stringify(projectDraw(drawDefinition)));
  expect(projectRoundTrip(other)).toEqual(projectRoundTrip(drawDefinition));
});
