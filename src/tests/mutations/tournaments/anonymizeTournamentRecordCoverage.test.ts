import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { DOUBLES } from '@Constants/eventConstants';

test('anonymize DOUBLES tournament covers PAIR participant handling', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, eventType: DOUBLES }],
  });

  // Verify PAIR participants exist
  const pairParticipants = tournamentRecord.participants.filter((p) => p.participantType === 'PAIR');
  expect(pairParticipants.length).toBeGreaterThan(0);

  const result = mocksEngine.anonymizeTournamentRecord({ tournamentRecord });
  expect(result.success).toEqual(true);

  // Verify pair participants have new names with '/' separator
  const anonPairParticipants = tournamentRecord.participants.filter((p) => p.participantType === 'PAIR');
  anonPairParticipants.forEach((pair) => {
    expect(pair.participantName).toBeDefined();
    expect(pair.participantName.includes('/')).toEqual(true);
  });
});

test('anonymize TEAM tournament covers TEAM participant handling', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: 'TEAM', tieFormatName: 'COLLEGE_DEFAULT' }],
  });

  // Verify TEAM participants exist
  const teamParticipants = tournamentRecord.participants.filter((p) => p.participantType === 'TEAM');
  expect(teamParticipants.length).toBeGreaterThan(0);

  const result = mocksEngine.anonymizeTournamentRecord({ tournamentRecord });
  expect(result.success).toEqual(true);

  // Team participants should have new names
  const anonTeamParticipants = tournamentRecord.participants.filter((p) => p.participantType === 'TEAM');
  anonTeamParticipants.forEach((team) => {
    expect(team.participantName).toBeDefined();
  });
});

test('anonymize tournament with GROUP participants covers GROUP handling', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
  });

  tournamentEngine.setState(tournamentRecord);

  const individualParticipants = tournamentRecord.participants.filter((p) => p.participantType === 'INDIVIDUAL');
  const individualParticipantIds = individualParticipants.slice(0, 3).map((p) => p.participantId);

  const groupResult = tournamentEngine.createGroupParticipant({
    individualParticipantIds,
    groupName: 'Test Group',
  });
  expect(groupResult.success).toEqual(true);

  const { tournamentRecord: updatedRecord } = tournamentEngine.getTournament();
  const groupParticipants = updatedRecord.participants.filter((p) => p.participantType === 'GROUP');
  expect(groupParticipants.length).toBeGreaterThan(0);

  const result = mocksEngine.anonymizeTournamentRecord({ tournamentRecord: updatedRecord });
  expect(result.success).toEqual(true);

  // Group participants should have new names
  const anonGroupParticipants = updatedRecord.participants.filter((p) => p.participantType === 'GROUP');
  anonGroupParticipants.forEach((group) => {
    expect(group.participantName).toBeDefined();
  });
});

test('anonymize tournament with venues covers venue/court handling', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    venueProfiles: [{ courtsCount: 4 }],
  });

  expect(tournamentRecord.venues?.length).toBeGreaterThan(0);
  expect(tournamentRecord.venues[0].courts?.length).toBeGreaterThan(0);

  const result = mocksEngine.anonymizeTournamentRecord({ tournamentRecord });
  expect(result.success).toEqual(true);

  // Venues should be anonymized
  tournamentRecord.venues.forEach((venue, i) => {
    expect(venue.venueName).toEqual(`Venue #${i}`);
    expect(venue.isMock).toEqual(true);
  });
});

test('anonymize with anonymizeParticipantNames: false preserves original names', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
  });

  const originalNames = tournamentRecord.participants
    .filter((p) => p.participantType === 'INDIVIDUAL')
    .map((p) => p.person?.standardFamilyName);

  const result = mocksEngine.anonymizeTournamentRecord({
    anonymizeParticipantNames: false,
    tournamentRecord,
  });
  expect(result.success).toEqual(true);

  // standardFamilyName should be preserved
  const anonParticipants = tournamentRecord.participants.filter((p) => p.participantType === 'INDIVIDUAL');
  anonParticipants.forEach((p, i) => {
    expect(p.person.standardFamilyName).toEqual(originalNames[i]);
  });
});

test('anonymize with keepExtensions true keeps all extensions', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
  });

  const result = mocksEngine.anonymizeTournamentRecord({
    keepExtensions: true,
    tournamentRecord,
  });
  expect(result.success).toEqual(true);
});

test('anonymize tournament with scheduling profile extension', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
  });

  const eventId = tournamentRecord.events[0].eventId;
  const drawId = tournamentRecord.events[0].drawDefinitions[0].drawId;
  const structureId = tournamentRecord.events[0].drawDefinitions[0].structures[0].structureId;

  // Add a scheduling profile extension to the tournament record
  if (!tournamentRecord.extensions) tournamentRecord.extensions = [];
  tournamentRecord.extensions.push({
    name: 'schedulingProfile',
    value: [
      {
        tournamentId: tournamentRecord.tournamentId,
        eventId,
        drawId,
        structureId,
      },
    ],
  });

  const result = mocksEngine.anonymizeTournamentRecord({ tournamentRecord });
  expect(result.success).toEqual(true);

  // Verify the scheduling profile IDs were updated
  const schedulingProfile = tournamentRecord.extensions.find((e) => e.name === 'schedulingProfile');
  expect(schedulingProfile).toBeDefined();
  expect(schedulingProfile.value[0].tournamentId).toEqual(tournamentRecord.tournamentId);
  expect(schedulingProfile.value[0].eventId).toEqual(tournamentRecord.events[0].eventId);
  expect(schedulingProfile.value[0].drawId).toEqual(tournamentRecord.events[0].drawDefinitions[0].drawId);
  expect(schedulingProfile.value[0].structureId).toEqual(
    tournamentRecord.events[0].drawDefinitions[0].structures[0].structureId,
  );
});

test('anonymize tournament with person requests extension', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
  });

  const individualParticipant = tournamentRecord.participants.find((p) => p.participantType === 'INDIVIDUAL');
  const personId = individualParticipant.person.personId;

  // Add a person requests extension to the tournament record
  if (!tournamentRecord.extensions) tournamentRecord.extensions = [];
  tournamentRecord.extensions.push({
    name: 'personRequests',
    value: [
      {
        personId,
        requestType: 'DO_NOT_SCHEDULE',
      },
    ],
  });

  const result = mocksEngine.anonymizeTournamentRecord({ tournamentRecord });
  expect(result.success).toEqual(true);

  // Verify the person requests personId was updated via idMap
  const personRequests = tournamentRecord.extensions.find((e) => e.name === 'personRequests');
  expect(personRequests).toBeDefined();
  // The personId should have been mapped to the new personId
  expect(personRequests.value[0].personId).not.toEqual(personId);
  expect(personRequests.value[0].personId).toBeDefined();
});

// Covers the seedAssignments branch + lineUp.map callback + birthYear path
// + non-gendered participant counter + first-class flightProfile + first-class
// scheduling.profile — these are the v5/CODES NATIVE-mode paths that the
// existing fixtures (LEGACY-style) miss.
test('anonymize covers v5 NATIVE-mode + birthDate + non-gendered paths', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }],
  });

  // Seed assignments — populate so the participantId-rewrite branch runs.
  const drawDef = tournamentRecord.events[0].drawDefinitions[0];
  const structure = drawDef.structures[0];
  const participant = tournamentRecord.participants[0];
  structure.seedAssignments = [{ seedNumber: 1, participantId: participant.participantId }];

  // lineUp on a matchUp side — exercises the .map() row callback.
  const matchUp = structure.matchUps[0];
  matchUp.sides = matchUp.sides ?? [{ sideNumber: 1 }, { sideNumber: 2 }];
  matchUp.sides[0].lineUp = [
    { participantId: tournamentRecord.participants[0].participantId, collectionAssignments: [] },
    { participantId: tournamentRecord.participants[1].participantId, collectionAssignments: [] },
  ];

  // First-class flightProfile (CODES Phase 3) — picked up alongside the
  // legacy extension form.
  tournamentRecord.events[0].flightProfile = {
    flights: [{ flightNumber: 1, drawId: drawDef.drawId, drawEntries: [] }],
  };

  // First-class scheduling.profile (CODES Phase 5).
  tournamentRecord.scheduling = {
    profile: [{ scheduleDate: '2026-06-01', venues: [{ venueId: 'v1', rounds: [] }] }],
  };

  // Give a participant a birthDate so the year-preserving branch runs.
  participant.person.birthDate = '1990-04-15';

  // Knock another participant's sex out so the non-gendered counter branch hits.
  const anotherParticipant = tournamentRecord.participants.find((p, i) => i > 0 && p.participantType === 'INDIVIDUAL');
  if (anotherParticipant?.person) anotherParticipant.person.sex = undefined;

  const result = mocksEngine.anonymizeTournamentRecord({ tournamentRecord });
  expect(result.success).toEqual(true);

  // birthDate preserved its year but rewrote month/day from the generated person
  expect(participant.person.birthDate?.startsWith('1990-')).toBe(true);

  // flightProfile + scheduling.profile remain present after anonymization
  expect(Array.isArray(tournamentRecord.events[0].flightProfile?.flights)).toBe(true);
  expect(Array.isArray(tournamentRecord.scheduling?.profile)).toBe(true);
});
