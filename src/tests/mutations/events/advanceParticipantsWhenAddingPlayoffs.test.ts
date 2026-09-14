import { getParticipantIds } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { globalState } from '../../..';
import { expect, it } from 'vitest';

tournamentEngine.devContext(true);

it('can add 3-4 playoff structure to a SINGLE ELIMINATION structure', () => {
  const allMatchUps: any[] = [];
  const matchUpAddNotices: number[] = [];

  const subscriptions = {
    addMatchUps: (payload) => {
      if (Array.isArray(payload)) {
        payload.forEach(({ matchUps }) => {
          matchUpAddNotices.push(matchUps.length);
          allMatchUps.push(...matchUps);
        });
      }
    },
  };

  globalState.setSubscriptions({ subscriptions });

  const drawProfiles = [
    {
      drawSize: 8,
      participantsCount: 8,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 1,
          scoreString: '6-2 6-1',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 2,
          scoreString: '6-2 6-1',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 3,
          scoreString: '6-2 6-1',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 4,
          scoreString: '6-2 6-1',
          winningSide: 1,
        },
        {
          roundNumber: 2,
          roundPosition: 1,
          scoreString: '6-2 6-1',
          winningSide: 1,
        },
        {
          roundNumber: 2,
          roundPosition: 2,
          scoreString: '6-2 6-1',
          winningSide: 1,
        },
      ],
    },
  ];
  const { success, drawDefinition } = tournamentEngineAddPlayoffsTest({
    playoffStructureNameBase: 'Playoff',
    playoffPositions: [3, 4],
    drawProfiles,
  });
  expect(success).toEqual(true);
  const { links, structures } = drawDefinition;
  expect(links.length).toEqual(1);
  expect(structures.length).toEqual(2);
  expect(structures[1].structureName).toEqual('Playoff 3-4');

  const consolationAssignedParticipantIds = getParticipantIds(structures[1].positionAssignments);
  expect(consolationAssignedParticipantIds.length).toEqual(2);

  expect(allMatchUps.length).toEqual(8);
  expect(matchUpAddNotices).toEqual([7, 1]);
});

function tournamentEngineAddPlayoffsTest(params) {
  const { playoffStructureNameBase, playoffPositions, roundNumbers, drawProfiles } = params;
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
    inContext: true,
  });

  tournamentEngine.setState(tournamentRecord);
  let { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const {
    structures: [{ structureId }],
  } = drawDefinition;

  const result = tournamentEngine.addPlayoffStructures({
    drawId,
    structureId,
    roundNumbers,
    playoffPositions,
    playoffStructureNameBase,
  });
  ({ drawDefinition } = tournamentEngine.getEvent({ drawId }));
  return { ...result, drawDefinition };
}
