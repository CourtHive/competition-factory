import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { isCompletedStructure } from '@Query/drawDefinition/structureActions';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { structureSort } from '@Functions/sorters/structureSort';
import { intersection, overlap, unique } from '@Tools/arrays';
import tournamentEngine from '@Engines/syncEngine';
import { xa } from '@Tools/extractAttributes';
import { mocksEngine } from '../../../../..';
import { expect, it } from 'vitest';

// constants
import { COMPASS, MAIN, PLAYOFF, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

it('is possible to have COMPASS playoff for Round Robin with playoffs', () => {
  const completionGoal = 48;
  const mockProfile = {
    tournamentName: 'RR with Compass',
    drawProfiles: [
      {
        drawType: ROUND_ROBIN_WITH_PLAYOFF,
        completionGoal,
        drawSize: 32,
        structureOptions: {
          playoffGroups: [
            {
              playoffStructureNameBase: 'Gold Flight',
              finishingPositions: [1, 2],
              drawType: COMPASS,
            },
            {
              playoffStructureNameBase: 'Silver Flight',
              finishingPositions: [3, 4],
              drawType: PLAYOFF,
            },
          ],
        },
      },
    ],
  };

  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord(mockProfile);

  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });

  const sortedStrucctureIds = drawDefinition.structures.sort(structureSort).map(({ structureId }) => structureId);

  // this is an exercise in sorting groups of linked structures...
  const linkRelationships = drawDefinition.links
    .sort(
      (a, b) => sortedStrucctureIds.indexOf(a.source.structureId) - sortedStrucctureIds.indexOf(b.source.structureId),
    )
    .filter(({ linkType }) => linkType === 'LOSER')
    .map(({ source, target }) => [source.structureId, target.structureId]);

  const linkGroups = linkRelationships.reduce((groups, relationship) => {
    const existingGroup = groups.find((group) => overlap(group, relationship));
    if (existingGroup) {
      existingGroup.push(...relationship);
    } else {
      groups.push(relationship);
    }
    return groups;
  }, []);

  const groupedNames = linkGroups.map((group) =>
    unique(group).map(
      (structureId) =>
        drawDefinition.structures.find((structure) => structure.structureId === structureId)?.structureName,
    ),
  );
  expect(groupedNames.length).toEqual(2);
  expect(groupedNames[0].sort()).toEqual([
    'Gold Flight East',
    'Gold Flight North',
    'Gold Flight Northeast',
    'Gold Flight Northwest',
    'Gold Flight South',
    'Gold Flight Southeast',
    'Gold Flight Southwest',
    'Gold Flight West',
  ]);
  expect(groupedNames[1].sort()).toEqual([
    'Silver Flight 17-32',
    'Silver Flight 19-20',
    'Silver Flight 21-24',
    'Silver Flight 23-24',
    'Silver Flight 25-32',
    'Silver Flight 27-28',
    'Silver Flight 29-32',
    'Silver Flight 31-32',
  ]);

  const drawMatchUps = allDrawMatchUps({ drawDefinition }).matchUps;
  const completedCount: number =
    drawMatchUps?.map((m) => (m.matchUpStatus === COMPLETED ? 1 : 0)).reduce((a: number, b: number) => a + b, 0) ?? 0;
  expect(completedCount).toEqual(completionGoal);

  const mainStructure = drawDefinition.structures.find(
    ({ stage, stageSequence }) => stage === MAIN && stageSequence === 1,
  );
  const structureMatchUps = getAllStructureMatchUps({
    structure: mainStructure,
  }).matchUps;
  expect(structureMatchUps.length).toEqual(completionGoal);

  const structureCompletedCount: number =
    drawMatchUps?.map((m) => (m.matchUpStatus === COMPLETED ? 1 : 0)).reduce((a: number, b: number) => a + b, 0) ?? 0;
  expect(structureCompletedCount).toEqual(completionGoal);

  const mainStructureId = mainStructure.structureId;
  const structureIsComplete = isCompletedStructure({
    structureId: mainStructureId,
    drawDefinition,
  });
  expect(structureIsComplete).toEqual(true);

  const g1 = drawDefinition.structures
    .find((s) => s.structureName === 'Gold Flight East')
    .positionAssignments.map(xa('participantId'));

  const g2 = drawDefinition.structures
    .find((s) => s.structureName === 'Silver Flight 17-32')
    .positionAssignments.map(xa('participantId'));

  expect(intersection(g1, g2)).toEqual([]);
});
