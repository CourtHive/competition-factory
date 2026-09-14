import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { INDIVIDUAL, TEAM } from '@Constants/participantConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { DOUBLES } from '@Constants/matchUpTypes';
import {
  MISSING_QUALIFIED_PARTICIPANTS,
  NO_DRAW_POSITIONS_AVAILABLE_FOR_QUALIFIERS,
} from '@Constants/errorConditionConstants';

it('can assign all available qualified participants to the main structure qualifying draw positions for a team event', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantType: TEAM, participantsCount: 30 },
    eventProfiles: [{ eventName: 'test', eventType: TEAM }],
    setState: true,
  });
  expect(tournamentRecord.participants.length).toEqual(270);

  const { participants: teamParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM] },
  });
  const { participants: individualParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });

  // assign individual participants to teams
  teamParticipants.slice(0, 18).forEach((team, index) => {
    tournamentEngine.addIndividualParticipantIds({
      participantIds: individualParticipants.slice(index * 10, (index + 1) * 10).map((p) => p.participantId),
      participantId: team.participantId,
    });
  });

  const teamParticipantIds = teamParticipants.map((p) => p.participantId);
  const mainParticipantIds = teamParticipantIds.slice(0, 14);
  const qualifyingParticipants = teamParticipants.slice(14, 18);
  const qualifyingParticipantIds = teamParticipantIds.slice(14, 18);
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
    qualifyingProfiles: [{ structureProfiles: [{ qualifyingPositions: 2, drawSize: 4 }] }],
    qualifyingOnly: true,
    eventId,
  });

  // assert QUALIFYING structure is populated and MAIN structure is empty
  const mainStructure = qualifyingDrawDefinition.structures.find(({ stage }) => stage === MAIN);
  const qualifyingStructure = qualifyingDrawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
  expect(qualifyingStructure.matchUps.length).toEqual(2);
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
        structureProfiles: [{ seedsCount: 4, drawSize: 4, qualifyingPositions: 2 }],
      },
    ],
    eventId,
  });

  // assert MAIN and QUALIFYING structures are populated
  const populatedMainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  const newQualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
  expect(populatedMainStructure.matchUps.length).toEqual(15);
  expect(newQualifyingStructure.matchUps.length).toEqual(2);

  const randQalifierList = tournamentEngine.getRandomQualifierList({ drawDefinition });

  const addMainDrawDefinitionResult = tournamentEngine.addDrawDefinition({
    activeTournamentId: tournamentRecord.tournamentId,
    drawDefinition,
    allowReplacement: true,
    eventId,
    randomList: randQalifierList,
  });

  expect(addMainDrawDefinitionResult.success).toEqual(true);

  // assert no qualified participants are available
  const noQualifiersProgressionResult = tournamentEngine.qualifierProgression({
    drawId: drawDefinition.drawId,
    targetRoundNumber: 1,
    tournamentId: tournamentRecord.tournamentId,
    eventId: eventId,
    randomList: randQalifierList,
  });

  expect(noQualifiersProgressionResult.error).toEqual(MISSING_QUALIFIED_PARTICIPANTS);

  // assign players and score tieMatchUps
  newQualifyingStructure.matchUps.forEach((matchUp) => {
    matchUp.sides.forEach((side) => {
      matchUp.tieMatchUps.forEach((tieMatchUp, tieMatchIndex) => {
        const isDoubles = tieMatchUp.matchUpType === DOUBLES;
        isDoubles
          ? Array.from({ length: 2 }).forEach((_, i) => {
              tournamentEngine.assignTieMatchUpParticipantId({
                teamParticipantId: side.participantId,
                participantId: qualifyingParticipants.find((p) => p.participantId).individualParticipantIds[
                  tieMatchIndex + i
                ],
                tieMatchUpId: tieMatchUp.matchUpId,
                sideNumber: i + 1,
                drawId: drawDefinition.drawId,
              });
            })
          : tournamentEngine.assignTieMatchUpParticipantId({
              teamParticipantId: side.participantId,
              participantId: qualifyingParticipants.find((p) => p.participantId).individualParticipantIds[
                tieMatchIndex
              ],
              tieMatchUpId: tieMatchUp.matchUpId,
              drawId: drawDefinition.drawId,
            });

        tournamentEngine.setMatchUpStatus({
          tournamentId: tournamentRecord.tournamentId,
          drawId: drawDefinition.drawId,
          matchUpId: matchUp.matchUpId,
          matchUpTieId: tieMatchUp.matchUpId,
          matchUpStatus: COMPLETED,
          outcome: { winningSide: 1 },
        });
      });
    });
  });

  const progressQualifiersResult = tournamentEngine.qualifierProgression({
    drawId: drawDefinition.drawId,
    targetRoundNumber: 1,
    tournamentId: tournamentRecord.tournamentId,
    eventId: eventId,
    randomList: randQalifierList,
  });

  // assert all assigned participants are team participants
  progressQualifiersResult.assignedParticipants.forEach(({ participantId }) => {
    const participant = qualifyingParticipants.find((p) => p.participantId === participantId);
    expect(participant.participantType).toEqual(TEAM);
  });
  expect(progressQualifiersResult.assignedParticipants.length).toEqual(2);
  expect(progressQualifiersResult.success).toEqual(true);

  // assert qualified participants have been assigned to the main draw positions
  const mainDrawPositionAssignments = populatedMainStructure.positionAssignments;
  expect(mainDrawPositionAssignments.length).toEqual(16);
  expect(mainDrawPositionAssignments.filter((p) => p.qualifier && p.participantId).length).toEqual(2);
  expect(mainDrawPositionAssignments.filter((p) => p.qualifier && !p.participantId).length).toEqual(0);
});
