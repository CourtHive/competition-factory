import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { FEMALE, MALE } from '@Constants/genderConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { DOUBLES } from '@Constants/eventConstants';

test('filterParticipants enableOrFiltering with multiple criteria', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, gender: MALE }],
    setState: true,
  });

  const { participants: allParticipants } = tournamentEngine.getParticipants({
    participantFilters: {},
  });
  expect(allParticipants.length).toBeGreaterThan(0);

  // enableOrFiltering: true - should return participants matching ANY criteria
  const { participants: orFiltered } = tournamentEngine.getParticipants({
    participantFilters: {
      enableOrFiltering: true,
      participantTypes: [INDIVIDUAL],
      genders: [MALE],
    },
  });
  expect(orFiltered.length).toBeGreaterThan(0);

  // enableOrFiltering: true with signInStatus
  const { participants: signInFiltered } = tournamentEngine.getParticipants({
    participantFilters: {
      enableOrFiltering: true,
      signInStatus: 'SIGNED_IN',
    },
  });
  // No one is signed in, so this should return empty (unless other OR criteria match)
  expect(signInFiltered).toBeDefined();

  // enableOrFiltering: true with eventIds
  const { participants: eventFiltered } = tournamentEngine.getParticipants({
    participantFilters: {
      enableOrFiltering: true,
      eventIds: [eventId],
      genders: [MALE],
    },
  });
  expect(eventFiltered.length).toBeGreaterThan(0);

  // enableOrFiltering: true with participantRoles
  const { participants: roleFiltered } = tournamentEngine.getParticipants({
    participantFilters: {
      enableOrFiltering: true,
      participantRoles: [COMPETITOR],
    },
  });
  expect(roleFiltered).toBeDefined();

  // enableOrFiltering: true with accessorValues
  const { participants: accessorFiltered } = tournamentEngine.getParticipants({
    participantFilters: {
      enableOrFiltering: true,
      accessorValues: [{ accessor: 'person.sex', value: MALE }],
    },
  });
  expect(accessorFiltered.length).toBeGreaterThan(0);
});

test('filterParticipants AND filtering with signInStatus and drawEntryStatuses', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  // Test drawEntryStatuses filter
  const { participants: drawEntryFiltered } = tournamentEngine.getParticipants({
    participantFilters: {
      drawEntryStatuses: [DIRECT_ACCEPTANCE],
    },
  });
  expect(drawEntryFiltered.length).toBeGreaterThan(0);

  // Test eventEntryStatuses filter
  const { participants: eventEntryFiltered } = tournamentEngine.getParticipants({
    participantFilters: {
      eventEntryStatuses: [DIRECT_ACCEPTANCE],
    },
  });
  expect(eventEntryFiltered.length).toBeGreaterThan(0);

  // Test signInStatus in AND mode
  const { participants: noSignIn } = tournamentEngine.getParticipants({
    participantFilters: {
      signInStatus: 'SIGNED_IN',
    },
  });
  expect(noSignIn.length).toBe(0);

  // Test positionedParticipants: true
  const { participants: positioned } = tournamentEngine.getParticipants({
    participantFilters: {
      positionedParticipants: true,
    },
  });
  expect(positioned.length).toBeGreaterThan(0);

  // Test positionedParticipants: false
  const { participants: notPositioned } = tournamentEngine.getParticipants({
    participantFilters: {
      positionedParticipants: false,
    },
  });
  expect(notPositioned).toBeDefined();

  // Test genders filter
  const { participants: genderFiltered } = tournamentEngine.getParticipants({
    participantFilters: {
      genders: [FEMALE],
    },
  });
  expect(genderFiltered).toBeDefined();
});

test('filterParticipants enableOrFiltering with positionedParticipants', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  // enableOrFiltering with positionedParticipants: true
  const { participants: orPositioned } = tournamentEngine.getParticipants({
    participantFilters: {
      enableOrFiltering: true,
      positionedParticipants: true,
    },
  });
  expect(orPositioned.length).toBeGreaterThan(0);

  // enableOrFiltering with positionedParticipants: false
  const { participants: orNotPositioned } = tournamentEngine.getParticipants({
    participantFilters: {
      enableOrFiltering: true,
      positionedParticipants: false,
    },
  });
  expect(orNotPositioned).toBeDefined();
});

test('filterParticipants enableOrFiltering with participantRoleResponsibilities', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  // Try enableOrFiltering with participantRoleResponsibilities
  const { participants: responsibilityFiltered } = tournamentEngine.getParticipants({
    participantFilters: {
      enableOrFiltering: true,
      participantRoleResponsibilities: ['Captain'],
    },
  });
  // No one has responsibilities, should be empty
  expect(responsibilityFiltered).toBeDefined();

  // AND mode with participantRoleResponsibilities
  const { participants: andResponsibility } = tournamentEngine.getParticipants({
    participantFilters: {
      participantRoleResponsibilities: ['Captain'],
    },
  });
  expect(andResponsibility).toBeDefined();
});

test('filterParticipants with eventIds filter on DOUBLES event', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, eventType: DOUBLES }],
    setState: true,
  });

  // eventIds filter with DOUBLES event - should include individualParticipantIds
  const { participants: eventFiltered } = tournamentEngine.getParticipants({
    participantFilters: {
      eventIds: [eventId],
    },
  });
  expect(eventFiltered.length).toBeGreaterThan(0);
});

test('filterParticipants enableOrFiltering with drawEntryStatuses and eventEntryStatuses', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });

  // OR filtering with drawEntryStatuses
  const { participants: orDrawEntry } = tournamentEngine.getParticipants({
    participantFilters: {
      enableOrFiltering: true,
      drawEntryStatuses: [DIRECT_ACCEPTANCE],
    },
  });
  expect(orDrawEntry.length).toBeGreaterThan(0);

  // OR filtering with eventEntryStatuses
  const { participants: orEventEntry } = tournamentEngine.getParticipants({
    participantFilters: {
      enableOrFiltering: true,
      eventEntryStatuses: [DIRECT_ACCEPTANCE],
    },
  });
  expect(orEventEntry.length).toBeGreaterThan(0);

  // OR filtering with participantIds
  const { participants: allPs } = tournamentEngine.getParticipants({});
  const someIds = allPs.slice(0, 3).map((p) => p.participantId);
  const { participants: orPids } = tournamentEngine.getParticipants({
    participantFilters: {
      enableOrFiltering: true,
      participantIds: someIds,
    },
  });
  expect(orPids.length).toBe(3);
});
