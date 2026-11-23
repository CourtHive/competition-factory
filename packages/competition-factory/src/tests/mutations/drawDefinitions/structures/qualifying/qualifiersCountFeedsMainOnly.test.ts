import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MAIN, QUALIFYING, ROUND_ROBIN, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

const assignmentsOf = (structure) =>
  structure.positionAssignments ?? structure.structures.flatMap((group) => group.positionAssignments ?? []);

// a drawProfile's qualifiersCount is the number of MAIN positions reserved for qualifiers;
// the qualifying structure that feeds those positions has no qualifiers of its own
it.each([
  { drawType: ROUND_ROBIN, qualifiersCount: 8 },
  { drawType: SINGLE_ELIMINATION, qualifiersCount: 4, qualifyingPositions: 4 },
])('a drawProfile qualifiersCount reserves no positions in the qualifying structure: $drawType', (profile) => {
  const { drawType, qualifiersCount, qualifyingPositions } = profile;
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 32,
        qualifiersCount,
        qualifyingProfiles: [
          { roundTarget: 1, structureProfiles: [{ stageSequence: 1, drawSize: 16, drawType, qualifyingPositions }] },
        ],
      },
    ],
    setState: true,
  });

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const qualifyingAssignments = assignmentsOf(drawDefinition.structures.find(({ stage }) => stage === QUALIFYING));
  expect(qualifyingAssignments.filter(({ qualifier }) => qualifier)).toHaveLength(0);
  expect(qualifyingAssignments.filter(({ participantId }) => participantId)).toHaveLength(16);

  const mainAssignments = assignmentsOf(drawDefinition.structures.find(({ stage }) => stage === MAIN));
  expect(mainAssignments.filter(({ qualifier }) => qualifier)).toHaveLength(4);
});
