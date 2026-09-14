import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import {
  MISSING_QUALIFIED_PARTICIPANTS,
  NO_DRAW_POSITIONS_AVAILABLE_FOR_QUALIFIERS,
} from '@Constants/errorConditionConstants';

it('can assign all available qualified participants to the main structure qualifying draw positions', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 100 },
    eventProfiles: [{ eventName: 'test' }],
  });
  expect(tournamentRecord.participants.length).toEqual(100);

  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const participantIds = participants.map((p) => p.participantId);
  const mainParticipantIds = participantIds.slice(0, 12);
  const qualifyingParticipantIds = participantIds.slice(12, 28);

  let result = tournamentEngine.addEventEntries({
    participantIds: mainParticipantIds,
    eventId,
  });
  expect(result.success).toEqual(true);
  result = tournamentEngine.addEventEntries({
    participantIds: qualifyingParticipantIds,
    entryStage: QUALIFYING,
    eventId,
  });
  expect(result.success).toEqual(true);

  const { drawDefinition: qualifyingDrawDefinition } = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [
      {
        structureProfiles: [
          {
            qualifyingPositions: 4,
            drawSize: 16,
          },
        ],
      },
    ],
    qualifyingOnly: true,
    eventId,
  });

  // assert QUALIFYING structure is populated and MAIN structure is empty
  const mainStructure = qualifyingDrawDefinition.structures.find(({ stage }) => stage === MAIN);
  const qualifyingStructure = qualifyingDrawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
  expect(qualifyingStructure.matchUps.length).toEqual(12);
  expect(mainStructure.matchUps.length).toEqual(0);

  const addDrawDefinitionResult = tournamentEngine.addDrawDefinition({
    activeTournamentId: tournamentRecord.tournamentId,
    drawDefinition: qualifyingDrawDefinition,
    allowReplacement: true,
    eventId,
  });

  expect(addDrawDefinitionResult.success).toEqual(true);

  // assert no MAIN draw qualifying positions are available
  const noMainProgressionResult = tournamentEngine.qualifierProgression({
    drawId: qualifyingDrawDefinition.drawId,
    targetRoundNumber: 1,
    tournamentId: tournamentRecord.tournamentId,
    eventId: eventId,
    randomList: [],
  });
  expect(noMainProgressionResult.error).toEqual(NO_DRAW_POSITIONS_AVAILABLE_FOR_QUALIFIERS);

  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [
      {
        structureProfiles: [{ seedsCount: 4, drawSize: 16, qualifyingPositions: 4 }],
      },
    ],
    eventId,
  });

  // assert MAIN and QUALIFYING structures are populated
  const populatedMainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  const newQualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
  expect(populatedMainStructure.matchUps.length).toEqual(15);
  expect(newQualifyingStructure.matchUps.length).toEqual(12);

  const addMainDrawDefinitionResult = tournamentEngine.addDrawDefinition({
    activeTournamentId: tournamentRecord.tournamentId,
    drawDefinition,
    allowReplacement: true,
    eventId,
  });

  expect(addMainDrawDefinitionResult.success).toEqual(true);

  const randQalifierList = tournamentEngine.getRandomQualifierList({ drawDefinition });

  // assert no qualified participants are available
  const noQualifiersProgressionResult = tournamentEngine.qualifierProgression({
    drawId: drawDefinition.drawId,
    targetRoundNumber: 1,
    tournamentId: tournamentRecord.tournamentId,
    eventId: eventId,
    randomList: randQalifierList,
  });

  expect(noQualifiersProgressionResult.error).toEqual(MISSING_QUALIFIED_PARTICIPANTS);

  newQualifyingStructure.matchUps.forEach(({ matchUpId }) =>
    tournamentEngine.setMatchUpStatus({
      tournamentId: tournamentRecord.tournamentId,
      drawId: drawDefinition.drawId,
      matchUpId,
      matchUpStatus: COMPLETED,
      outcome: { winningSide: 1 },
    }),
  );

  const progressQualifiersResult = tournamentEngine.qualifierProgression({
    drawId: drawDefinition.drawId,
    targetRoundNumber: 1,
    tournamentId: tournamentRecord.tournamentId,
    eventId: eventId,
    randomList: randQalifierList,
  });

  expect(progressQualifiersResult.assignedParticipants.length).toEqual(4);
  expect(progressQualifiersResult.success).toEqual(true);

  // assert qualified participants have been assigned to the main draw positions
  const mainDrawPositionAssignments = populatedMainStructure.positionAssignments;
  expect(mainDrawPositionAssignments.length).toEqual(16);
  expect(mainDrawPositionAssignments.filter((p) => p.qualifier && p.participantId).length).toEqual(4);
  expect(mainDrawPositionAssignments.filter((p) => p.qualifier && !p.participantId).length).toEqual(0);
});
