import { generateTeamTournament } from './generateTestTeamTournament';
import { getParticipantId } from '@Functions/global/extractors';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { INDIVIDUAL } from '@Constants/participantConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';

test('collection matchUps appear in participant reports', () => {
  const drawSize = 8;
  const { tournamentRecord, drawId } = generateTeamTournament({ drawSize });
  tournamentEngine.setState(tournamentRecord);

  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const { positionAssignments } = drawDefinition.structures[0];

  const getTeamParticipants = (drawPositions: string[] = []) => {
    const teamParticipantIds = positionAssignments
      .filter(({ drawPosition }) => drawPositions.includes(drawPosition))
      .map(getParticipantId);

    const { participants: teamParticipants } = tournamentEngine.devContext(true).getParticipants({
      participantFilters: { participantIds: teamParticipantIds },
    });

    return teamParticipants;
  };

  let { matchUps: doublesMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [DOUBLES] },
  });

  // create collectionAssignments for all doublesMatchUps
  doublesMatchUps.forEach((doublesMatchUp) => {
    const { drawPositions, matchUpId: doublesMatchUpId } = doublesMatchUp;
    const teamParticipants = getTeamParticipants(drawPositions);
    teamParticipants.forEach((teamParticipant) => {
      const individualParticipantIds = teamParticipant.individualParticipantIds.slice(0, 2);
      individualParticipantIds.forEach((individualParticipantId, i) => {
        const result = tournamentEngine.assignTieMatchUpParticipantId({
          participantId: individualParticipantId,
          tieMatchUpId: doublesMatchUpId,
          drawId,
        });
        expect(result.success).toEqual(true);
        expect(result.modifiedLineUp.length).toEqual(i + 1);
      });
    });
  });

  ({ matchUps: doublesMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [DOUBLES] },
  }));

  doublesMatchUps.forEach(({ sides }) => {
    if (sides) {
      sides.forEach((side) => {
        if (side.participant) {
          expect(side.participant.individualParticipantIds.length).toEqual(2);
        }
      });
    }
  });

  const { matchUps: singlesMatchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [SINGLES] },
  });

  const teamSinglesCount = {};

  // create collectionAssignments for all singlesMatchUps
  singlesMatchUps.forEach((singlesMatchUp) => {
    const { drawPositions, matchUpId: doublesMatchUpId } = singlesMatchUp;
    const teamParticipants = getTeamParticipants(drawPositions);
    teamParticipants.forEach((teamParticipant) => {
      const { participantId } = teamParticipant;

      if (!teamSinglesCount[participantId]) teamSinglesCount[participantId] = 0;
      const count = teamSinglesCount[participantId];

      const individualParticipantId = teamParticipant.individualParticipantIds.slice(count, count + 1)[0];
      teamSinglesCount[participantId] += 1;

      const result = tournamentEngine.assignTieMatchUpParticipantId({
        participantId: individualParticipantId,
        tieMatchUpId: doublesMatchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);
    });
  });

  singlesMatchUps.forEach(({ sides }) => {
    if (sides) {
      sides.forEach((side) => {
        if (side.participant) {
          expect(side.participant.individualParticipantIds.length).toEqual(1);
        }
      });
    }
  });

  const { participants } = tournamentEngine.devContext(true).getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
    withEvents: true,
    withDraws: true,
  });
  expect(participants[0].draws[0].partnerParticipantIds.length).toEqual(1);
  expect(participants[0].events[0].partnerParticipantIds.length).toEqual(1);

  // check that the generated pairParticipant was used...
  // ...and that the intermediate pairParticipants (with one individualParticipantId), were deleted
  expect(participants[0].pairParticipantIds.length).toEqual(1);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [DOUBLES] },
  });
  const placedParticipantIds = matchUps
    .map(({ sides }) => sides.map(({ participantId }) => participantId))
    .flat()
    .filter(Boolean);
  expect(placedParticipantIds.length).toEqual(drawSize);

  const { participants: placedPairParticipants } = tournamentEngine.getParticipants({
    participantFilters: { participantIds: placedParticipantIds },
    withGroupings: true,
    withMatchUps: true,
  });

  expect(placedPairParticipants.length).toEqual(drawSize);

  // unless withTeamMatchUps, DOUBLES pairParticipants will only appear in DOUBLES matchUps
  placedPairParticipants.forEach((participant) => {
    expect(participant.matchUps.length).toEqual(1);
  });
});
