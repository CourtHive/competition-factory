import { mocksEngine } from '@Assemblies/engines/mock';
import { generateDateRange } from '@Tools/dateTime';
import { queryEngine } from '@Engines/queryEngine';
import tournamentEngine from '@Engines/syncEngine';
import { hav } from '@Tools/objects';
import { expect, it } from 'vitest';

// constants
import { TEAM as TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { ASSIGN_PARTICIPANT } from '@Constants/positionActionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { AD_HOC } from '@Constants/drawDefinitionConstants';
import { SINGLES, TEAM } from '@Constants/eventConstants';
import { COMPETITOR } from '@Constants/participantRoles';

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

it('can assign participants to SINGLES/DOUBLES matchUps in TEAM AdHoc events', () => {
  const tournamentId = 't1';
  const venueId = 'v1';
  const eventId = 'e1';
  const drawId = 'd1';

  let result = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawId, drawSize: 6, eventType: TEAM, drawType: AD_HOC, eventId, tieFormatName: DOMINANT_DUO, idPrefix: 'mu' },
    ],
    participantsProfile: { idPrefix: 'ptcpt' },
    tournamentAttributes: { tournamentId },
    policyDefinitions,
    setState: true,
  });
  expect(result.success).toEqual(true);

  result = queryEngine.getParticipants().participants;
  expect(result.length).toEqual(24);
  //prettier-ignore
  expect(result.map((p) => p.participantId)).toEqual([
    'ptcpt-I-0', 'ptcpt-I-1', 'ptcpt-I-2', 'ptcpt-I-3', 'ptcpt-I-4', 'ptcpt-I-5', 'ptcpt-I-6',
    'ptcpt-I-7', 'ptcpt-I-8', 'ptcpt-I-9', 'ptcpt-I-10', 'ptcpt-I-11', 'ptcpt-P-0', 'ptcpt-P-1',
    'ptcpt-P-2', 'ptcpt-P-3', 'ptcpt-P-4', 'ptcpt-P-5', 'TEAM-ptcpt-P-0', 'TEAM-ptcpt-P-1',
    'TEAM-ptcpt-P-2', 'TEAM-ptcpt-P-3', 'TEAM-ptcpt-P-4', 'TEAM-ptcpt-P-5',
  ]);

  result = tournamentEngine.executionQueue([
    {
      method: 'drawMatic',
      params: {
        participantIds: [
          'TEAM-ptcpt-P-0',
          'TEAM-ptcpt-P-1',
          'TEAM-ptcpt-P-2',
          'TEAM-ptcpt-P-3',
          'TEAM-ptcpt-P-4',
          'TEAM-ptcpt-P-5',
        ],
        scaleAccessor: 'utrRating',
        scaleName: 'UTR',
        idPrefix: 'ah',
        drawId,
      },
    },
    {
      method: 'addAdHocMatchUps',
      pipe: { matchUps: true },
      params: { drawId },
    },
    {
      method: 'addVenue',
      params: {
        venue: {
          venueName: 'Mock Facility',
          venueAbbreviation: 'MF',
          venueId,
        },
      },
    },
  ]);
  expect(result.results[0].success).toEqual(true);
  expect(result.results[1].success).toEqual(true);
  expect(result.results[2].success).toEqual(true);
  expect(result.success).toEqual(true);

  // unnecessary for the purpse of this test --------------------------------------------------------
  result = tournamentEngine.generateCourts({ count: 4, idPrefix: 'court' });
  expect(result.courts.length).toEqual(4);
  expect(result.success).toEqual(true);

  const {
    tournamentInfo: { startDate, endDate },
  } = tournamentEngine.getTournamentInfo();
  const datesCount = generateDateRange(startDate, endDate).length;
  expect(result.courts.every((court) => court.dateAvailability?.length === datesCount)).toEqual(true);

  result = tournamentEngine.modifyVenue({ venueId, modifications: { courts: result.courts } });
  expect(result.success).toEqual(true);
  // end unnecessary for the purpse of this test -----------------------------------------------------

  const tieMatchUpId = 'd1-ah-1-0-e1-COL-2-TMU-1';

  result = tournamentEngine.matchUpActions({
    matchUpId: tieMatchUpId,
    sideNumber: 1,
    tournamentId,
    eventId,
    drawId,
  });

  expect(result.validActions.find((x) => x.type === ASSIGN_PARTICIPANT).availableParticipants.length).toEqual(2);

  const participantId = 'ptcpt-I-0';
  result = tournamentEngine.executionQueue([
    {
      method: 'assignTieMatchUpParticipantId',
      params: {
        participantId,
        sideNumber: 1,
        tieMatchUpId,
        drawId: 'd1',
      },
    },
  ]);
  expect(result.success).toEqual(true);

  result = tournamentEngine.findMatchUp({ matchUpId: tieMatchUpId }); // resolve by brute force, inContext by default
  expect(result.matchUp.sides.find(hav({ sideNumber: 1 })).participant.participantId).toEqual(participantId);

  const side2participantId = 'ptcpt-I-8';
  result = tournamentEngine.executionQueue([
    {
      method: 'assignTieMatchUpParticipantId',
      params: {
        participantId: side2participantId,
        tieMatchUpId,
        sideNumber: 2,
        drawId,
      },
    },
  ]);
  expect(result.success).toEqual(true);

  result = tournamentEngine.findMatchUp({ matchUpId: tieMatchUpId }); // resolve by brute force, inContext by default
  expect(result.matchUp.sides.find(hav({ sideNumber: 2 })).participant.participantId).toEqual(side2participantId);

  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-1 6-2',
    winningSide: 1,
  });
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: tieMatchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.findMatchUp({ matchUpId: tieMatchUpId }); // resolve by brute force, inContext by default
  expect(result.matchUp.matchUpStatus).toEqual(COMPLETED);
});

it('drawMatic avoids pairing participants from the same team', () => {
  // Create a SINGLES AD_HOC tournament with 12 individual participants
  let result: any = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 12, drawType: AD_HOC, eventType: SINGLES, idPrefix: 'dm' }],
    participantsProfile: { idPrefix: 'P' },
    setState: true,
  });
  expect(result.success).toEqual(true);
  const drawId = result.drawIds[0];

  // Get individual participant IDs
  const { participants } = tournamentEngine.getParticipants();
  const individualIds = participants.map((p: any) => p.participantId);
  expect(individualIds.length).toEqual(12);

  // Create 4 teams of 3 individuals each
  const teams = [
    { participantId: 'TEAM-A', participantName: 'Team A', individualParticipantIds: individualIds.slice(0, 3) },
    { participantId: 'TEAM-B', participantName: 'Team B', individualParticipantIds: individualIds.slice(3, 6) },
    { participantId: 'TEAM-C', participantName: 'Team C', individualParticipantIds: individualIds.slice(6, 9) },
    { participantId: 'TEAM-D', participantName: 'Team D', individualParticipantIds: individualIds.slice(9, 12) },
  ].map((team) => ({ ...team, participantType: TEAM_PARTICIPANT, participantRole: COMPETITOR }));

  result = tournamentEngine.addParticipants({ participants: teams });
  expect(result.success).toEqual(true);

  // Build a lookup: individualId → teamId
  const teamByIndividual: Record<string, string> = {};
  for (const team of teams) {
    for (const id of team.individualParticipantIds) {
      teamByIndividual[id] = team.participantId;
    }
  }

  // Run drawMatic with default sameTeamValue (100) — should avoid same-team pairings
  result = tournamentEngine.drawMatic({ drawId, participantIds: individualIds });
  expect(result.success).toEqual(true);
  expect(result.matchUps.length).toEqual(6);

  // Verify no matchup pairs two participants from the same team
  for (const matchUp of result.matchUps) {
    const side1Id = matchUp.sides[0].participantId;
    const side2Id = matchUp.sides[1].participantId;
    expect(teamByIndividual[side1Id]).not.toEqual(teamByIndividual[side2Id]);
  }

  // Add the round and generate a second round — verify avoidance holds across rounds
  const structureId = result.matchUps[0].structureId;
  result = tournamentEngine.addAdHocMatchUps({ matchUps: result.matchUps, structureId, drawId });
  expect(result.success).toEqual(true);

  result = tournamentEngine.drawMatic({ drawId, participantIds: individualIds });
  expect(result.success).toEqual(true);

  for (const matchUp of result.matchUps) {
    const side1Id = matchUp.sides[0].participantId;
    const side2Id = matchUp.sides[1].participantId;
    expect(teamByIndividual[side1Id]).not.toEqual(teamByIndividual[side2Id]);
  }
});
