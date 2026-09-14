import { participantScaleItem } from '@Query/participant/participantScaleItem';
import { getParticipantId } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { generateRange } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants and types
import { INVALID_PARTICIPANT_IDS, INVALID_VALUES, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { SINGLES_EVENT, TEAM_EVENT } from '@Constants/eventConstants';
import { TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { UNGROUPED } from '@Constants/entryStatusConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { ScaleAttributes } from '@Types/factoryTypes';
import { RANKING } from '@Constants/scaleConstants';

const EVENT_NAME = 'Team Event';

it('can automatically assign participants to teams using individualParticipantIds and scaleAttributes', () => {
  const participantsCount = 100;

  const eventProfiles = [{ eventName: EVENT_NAME, eventType: TEAM_EVENT }];
  const participantsProfile = {
    scaledParticipantsCount: participantsCount,
    category: { categoryName: '18U' },
    rankingRange: [1, 100],
    participantsCount,
  };

  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile,
    setState: true,
    eventProfiles,
  });

  const individualParticipantIds = tournamentRecord.participants.map(getParticipantId);

  let result = tournamentEngine.addEventEntries({
    participantIds: individualParticipantIds,
    eventId,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);

  result = tournamentEngine.addEventEntries({
    participantIds: individualParticipantIds,
    entryStatus: UNGROUPED,
    eventId,
  });
  expect(result.success).toEqual(true);

  let { event } = tournamentEngine.getEvent({ eventId });
  expect(event.entries.length).toEqual(participantsCount);

  let teamParticipants: any = generateRange(0, 8).map((i) => ({
    participantName: `Team ${i + 1}`,
    participantType: TEAM_PARTICIPANT,
    participantRole: COMPETITOR,
  }));

  result = tournamentEngine.addParticipants({
    participants: teamParticipants,
  });
  expect(result.success).toEqual(true);

  const teamParticipantIds = teamParticipants.map(getParticipantId);

  result = tournamentEngine.addEventEntries({
    participantIds: teamParticipantIds,
    eventId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.scaledTeamAssignment({
    individualParticipantIds,
    teamParticipantIds,
  });
  expect(result.error).toEqual(MISSING_VALUE);

  result = tournamentEngine.scaledTeamAssignment({
    individualParticipantIds,
    teamParticipantIds,
    scaleAttributes: {},
  });
  expect(result.error).toEqual(INVALID_VALUES);

  const scaleAttributes: ScaleAttributes = {
    eventType: SINGLES_EVENT,
    scaleType: RANKING,
    scaleName: '18U',
  };
  tournamentEngine.scaledTeamAssignment({
    individualParticipantIds,
    teamParticipantIds,
    scaleAttributes,
  });

  teamParticipants = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM_PARTICIPANT] },
    withIndividualParticipants: true,
    withScaleValues: true,
    inContext: true,
  }).participants;

  const teamMemberCounts = teamParticipants.map((teamParticipant) => teamParticipant.individualParticipants.length);
  expect(teamMemberCounts).toEqual([13, 13, 13, 13, 12, 12, 12, 12]);

  const teamScaleTotals = teamParticipants.map((teamParticipant) =>
    teamParticipant.individualParticipants
      .map((participant) => participantScaleItem({ participant, scaleAttributes })?.scaleItem?.scaleValue)
      .reduce((a, b) => (a || 0) + (b || 0)),
  );
  // 100 participants with rankings 1-100 were distributed across 8 teams.
  // 4 teams received an additional team member, rankings 97, 98, 99, 100
  // all teams are balanced apart from the final four placements
  expect(teamScaleTotals).toEqual([679, 680, 681, 682, 582, 582, 582, 582]);

  event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.entries.length).toEqual(teamParticipants.length);
});

it('can automatically assign participants to teams using scaledParticipants', () => {
  const participantsCount = 100;

  const eventProfiles = [{ eventName: EVENT_NAME, eventType: TEAM_EVENT }];
  const participantsProfile = {
    scaledParticipantsCount: participantsCount,
    category: { categoryName: '18U' },
    rankingRange: [1, 100],
    participantsCount,
  };

  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile,
    eventProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const individualParticipants = tournamentRecord.participants;
  const individualParticipantIds = individualParticipants.map(getParticipantId);

  let result = tournamentEngine.addEventEntries({
    participantIds: individualParticipantIds,
    entryStatus: UNGROUPED,
    eventId,
  });
  expect(result.success).toEqual(true);

  let { event } = tournamentEngine.getEvent({ eventId });
  expect(event.entries.length).toEqual(participantsCount);

  let teamParticipants: any = generateRange(0, 8).map((i) => ({
    participantName: `Team ${i + 1}`,
    participantType: TEAM_PARTICIPANT,
    participantRole: COMPETITOR,
  }));

  result = tournamentEngine.addParticipants({
    participants: teamParticipants,
  });
  expect(result.success).toEqual(true);

  const scaleAttributes: ScaleAttributes = {
    eventType: SINGLES_EVENT,
    scaleType: RANKING,
    scaleName: '18U',
  };

  const scaledParticipants = individualParticipants.map((participant) => ({
    scaleValue: participantScaleItem({ participant, scaleAttributes })?.scaleItem?.scaleValue,
    participantId: participant.participantId,
  }));

  const teamParticipantIds = teamParticipants.map(getParticipantId);
  result = tournamentEngine.addEventEntries({
    participantIds: teamParticipantIds,
    eventId,
  });
  expect(result.success).toEqual(true);

  tournamentEngine.scaledTeamAssignment({
    teamParticipantIds,
    scaledParticipants,
  });

  teamParticipants = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM_PARTICIPANT] },
    withIndividualParticipants: true,
    withScaleValues: true,
  }).participants;

  const teamMemberCounts = teamParticipants.map((teamParticipant) => teamParticipant.individualParticipants.length);
  expect(teamMemberCounts).toEqual([13, 13, 13, 13, 12, 12, 12, 12]);

  const teamScaleTotals = teamParticipants.map((teamParticipant) =>
    teamParticipant.individualParticipants
      .map((participant) => participantScaleItem({ participant, scaleAttributes })?.scaleItem?.scaleValue)
      .reduce((a, b) => (a || 0) + (b || 0)),
  );
  // 100 participants with rankings 1-100 were distributed across 8 teams.
  // 4 teams received an additional team member, rankings 97, 98, 99, 100
  // all teams are balanced apart from the final four placements
  expect(teamScaleTotals).toEqual([679, 680, 681, 682, 582, 582, 582, 582]);

  event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.entries.length).toEqual(teamParticipants.length);
});

it('will cleanup UNGROUPED participant entries if TEAM entry is added AFTER team assignments are made', () => {
  const participantsCount = 100;

  const eventProfiles = [{ eventName: EVENT_NAME, eventType: TEAM_EVENT }];
  const participantsProfile = {
    scaledParticipantsCount: participantsCount,
    category: { categoryName: '18U' },
    rankingRange: [1, 100],
    participantsCount,
  };

  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile,
    eventProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const individualParticipants = tournamentRecord.participants;
  const individualParticipantIds = individualParticipants.map(getParticipantId);

  let result = tournamentEngine.addEventEntries({
    participantIds: individualParticipantIds,
    entryStatus: UNGROUPED,
    eventId,
  });
  expect(result.success).toEqual(true);

  let { event } = tournamentEngine.getEvent({ eventId });
  expect(event.entries.length).toEqual(participantsCount);

  let teamParticipants: any = generateRange(0, 8).map((i) => ({
    participantName: `Team ${i + 1}`,
    participantType: TEAM_PARTICIPANT,
    participantRole: COMPETITOR,
  }));

  result = tournamentEngine.addParticipants({
    participants: teamParticipants,
  });
  expect(result.success).toEqual(true);

  const scaleAttributes: ScaleAttributes = {
    eventType: SINGLES_EVENT,
    scaleType: RANKING,
    scaleName: '18U',
  };

  const scaledParticipants = individualParticipants.map((participant) => ({
    participantId: participant.participantId,
    scaleValue: participantScaleItem({ participant, scaleAttributes })?.scaleItem?.scaleValue,
  }));

  const teamParticipantIds = teamParticipants.map(getParticipantId);
  tournamentEngine.scaledTeamAssignment({
    teamParticipantIds,
    scaledParticipants,
  });

  teamParticipants = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM_PARTICIPANT] },
    withIndividualParticipants: true,
    withScaleValues: true,
  }).participants;

  const teamMemberCounts = teamParticipants.map((teamParticipant) => teamParticipant.individualParticipants.length);
  expect(teamMemberCounts).toEqual([13, 13, 13, 13, 12, 12, 12, 12]);

  const teamScaleTotals = teamParticipants.map((teamParticipant) =>
    teamParticipant.individualParticipants
      .map((participant) => participantScaleItem({ participant, scaleAttributes })?.scaleItem?.scaleValue)
      .reduce((a, b) => (a || 0) + (b || 0)),
  );
  // 100 participants with rankings 1-100 were distributed across 8 teams.
  // 4 teams received an additional team member, rankings 97, 98, 99, 100
  // all teams are balanced apart from the final four placements
  expect(teamScaleTotals).toEqual([679, 680, 681, 682, 582, 582, 582, 582]);

  event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.entries.length).toEqual(participantsCount);

  result = tournamentEngine.addEventEntries({
    participantIds: teamParticipantIds,
    eventId,
  });
  expect(result.success).toEqual(true);

  event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.entries.length).toEqual(teamParticipants.length);
});

it('will generate teams for scaledTeamAssignment when given teamsCount', () => {
  const participantsCount = 100;

  const eventProfiles = [{ eventName: EVENT_NAME, eventType: TEAM_EVENT }];
  const participantsProfile = {
    scaledParticipantsCount: participantsCount,
    category: { categoryName: '18U' },
    rankingRange: [1, 100],
    participantsCount,
  };

  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile,
    eventProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const individualParticipants = tournamentRecord.participants;
  const individualParticipantIds = individualParticipants.map(getParticipantId);

  const result = tournamentEngine.addEventEntries({
    participantIds: individualParticipantIds,
    entryStatus: UNGROUPED,
    eventId,
  });
  expect(result.success).toEqual(true);

  const { event } = tournamentEngine.getEvent({ eventId });
  expect(event.entries.length).toEqual(participantsCount);

  const scaleAttributes: ScaleAttributes = {
    eventType: SINGLES_EVENT,
    scaleType: RANKING,
    scaleName: '18U',
  };

  const scaledParticipants = individualParticipants.map((participant) => ({
    participantId: participant.participantId,
    scaleValue: participantScaleItem({ participant, scaleAttributes })?.scaleItem?.scaleValue,
  }));

  tournamentEngine.scaledTeamAssignment({
    scaledParticipants,
    teamsCount: 8,
  });

  const teamParticipants = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM_PARTICIPANT] },
    withIndividualParticipants: true,
    withScaleValues: true,
  }).participants;

  const teamMemberCounts = teamParticipants.map((teamParticipant) => teamParticipant.individualParticipants.length);
  expect(teamMemberCounts).toEqual([13, 13, 13, 13, 12, 12, 12, 12]);

  const teamScaleTotals = teamParticipants.map((teamParticipant) =>
    teamParticipant.individualParticipants
      .map((participant) => participantScaleItem({ participant, scaleAttributes })?.scaleItem?.scaleValue)
      .reduce((a, b) => (a || 0) + (b || 0)),
  );
  // 100 participants with rankings 1-100 were distributed across 8 teams.
  // 4 teams received an additional team member, rankings 97, 98, 99, 100
  // all teams are balanced apart from the final four placements
  expect(teamScaleTotals).toEqual([679, 680, 681, 682, 582, 582, 582, 582]);
});

it('can determine teams from DIRECT_ACCEPTANCE entries of a TEAM event', () => {
  const participantsCount = 100;

  const eventProfiles = [{ eventName: EVENT_NAME, eventType: TEAM_EVENT }];
  const participantsProfile = {
    scaledParticipantsCount: participantsCount,
    category: { categoryName: '18U' },
    rankingRange: [1, 100],
    participantsCount,
  };

  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile,
    eventProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const individualParticipantIds = tournamentRecord.participants.map(getParticipantId);

  let result = tournamentEngine.addEventEntries({
    participantIds: individualParticipantIds,
    eventId,
  });
  expect(result.error).toEqual(INVALID_PARTICIPANT_IDS);

  result = tournamentEngine.addEventEntries({
    participantIds: individualParticipantIds,
    entryStatus: UNGROUPED,
    eventId,
  });
  expect(result.success).toEqual(true);

  let { event } = tournamentEngine.getEvent({ eventId });
  expect(event.entries.length).toEqual(participantsCount);

  let teamParticipants: any = generateRange(0, 8).map((i) => ({
    participantName: `Team ${i + 1}`,
    participantType: TEAM_PARTICIPANT,
    participantRole: COMPETITOR,
  }));

  result = tournamentEngine.addParticipants({
    participants: teamParticipants,
  });
  expect(result.success).toEqual(true);

  const teamParticipantIds = teamParticipants.map(getParticipantId);

  result = tournamentEngine.addEventEntries({
    participantIds: teamParticipantIds,
    eventId,
  });
  expect(result.success).toEqual(true);

  const scaleAttributes: ScaleAttributes = {
    eventType: SINGLES_EVENT,
    scaleType: RANKING,
    scaleName: '18U',
  };

  result = tournamentEngine.scaledTeamAssignment({
    individualParticipantIds,
    scaleAttributes,
  });
  expect(result.error).toEqual(INVALID_VALUES);

  tournamentEngine.scaledTeamAssignment({
    individualParticipantIds,
    scaleAttributes,
    eventId,
  });

  teamParticipants = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [TEAM_PARTICIPANT] },
    withIndividualParticipants: true,
    withScaleValues: true,
  }).participants;

  const teamMemberCounts = teamParticipants.map((teamParticipant) => teamParticipant.individualParticipants.length);
  expect(teamMemberCounts).toEqual([13, 13, 13, 13, 12, 12, 12, 12]);

  const teamScaleTotals = teamParticipants.map((teamParticipant) =>
    teamParticipant.individualParticipants
      .map((participant) => participantScaleItem({ participant, scaleAttributes })?.scaleItem?.scaleValue)
      .reduce((a, b) => (a || 0) + (b || 0)),
  );
  // 100 participants with rankings 1-100 were distributed across 8 teams.
  // 4 teams received an additional team member, rankings 97, 98, 99, 100
  // all teams are balanced apart from the final four placements
  expect(teamScaleTotals).toEqual([679, 680, 681, 682, 582, 582, 582, 582]);

  event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.entries.length).toEqual(teamParticipants.length);
});
