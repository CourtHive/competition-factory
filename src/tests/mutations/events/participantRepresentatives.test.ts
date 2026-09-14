import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { intersection } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

it('can set and get drawRepresentatitveIds', () => {
  const drawProfiles = [
    {
      drawSize: 8,
      participantsCount: 6,
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
    inContext: true,
  });

  const { participants } = tournamentEngine.setState(tournamentRecord).getParticipants();
  const participantIds = participants.map(({ participantId }) => participantId);

  const representativeParticipantIds = participantIds.slice(0, 2);

  let result = tournamentEngine.setDrawParticipantRepresentativeIds({
    representativeParticipantIds,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.setDrawParticipantRepresentativeIds({
    representativeParticipantIds: ['bogusId'],
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.setDrawParticipantRepresentativeIds({
    drawId,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  const { representativeParticipantIds: retrievedIds } = tournamentEngine.getDrawParticipantRepresentativeIds({
    drawId,
  });

  expect(intersection(representativeParticipantIds, retrievedIds).length).toEqual(representativeParticipantIds.length);

  result = tournamentEngine.setDrawParticipantRepresentativeIds({
    representativeParticipantIds: [],
    drawId,
  });
  expect(result.success).toEqual(true);

  const { representativeParticipantIds: updatedIds } = tournamentEngine.getDrawParticipantRepresentativeIds({ drawId });

  expect(updatedIds.length).toEqual(0);
});
