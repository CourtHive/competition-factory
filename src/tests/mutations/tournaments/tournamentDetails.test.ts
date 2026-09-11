import { getTournamentInfo } from '@Query/tournaments/getTournamentInfo';
import { setSubscriptions } from '@Global/state/globalState';
import { dateStringDaysChange } from '@Tools/dateTime';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { INVALID_DATE, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { MODIFY_TOURNAMENT_DETAIL } from '@Constants/topicConstants';
import { IN_PROGRESS } from '@Constants/tournamentConstants';

test('tournamentEngine can set tournament startDate and endDate', () => {
  mocksEngine.generateTournamentRecord({ setState: true });
  let { tournamentInfo } = tournamentEngine.getTournamentInfo();
  const { startDate, endDate } = tournamentInfo;
  expect(startDate).not.toBeUndefined();
  expect(endDate).not.toBeUndefined();

  let result = tournamentEngine.setTournamentStartDate();
  expect(result.error).toEqual(INVALID_DATE);

  const newStartDate = dateStringDaysChange(endDate, 1);
  result = tournamentEngine.setTournamentStartDate({ startDate: newStartDate });
  expect(result.success).toEqual(true);

  ({ tournamentInfo } = tournamentEngine.getTournamentInfo());
  expect(tournamentInfo.endDate).toEqual(newStartDate);

  result = tournamentEngine.setTournamentEndDate();
  expect(result.error).toEqual(INVALID_DATE);

  const newEndDate = dateStringDaysChange(newStartDate, 7);
  result = tournamentEngine.setTournamentEndDate({ endDate: newEndDate });
  expect(result.success).toEqual(true);

  const anEarlierEndDate = dateStringDaysChange(newStartDate, -1);
  result = tournamentEngine.setTournamentEndDate({ endDate: anEarlierEndDate });
  expect(result.success).toEqual(true);

  result = tournamentEngine.setTournamentStatus({ status: 'UNKNOWN' });
  expect(result.error).toEqual(INVALID_VALUES);

  result = tournamentEngine.setTournamentStatus();
  expect(result.success).toEqual(true);

  result = tournamentEngine.setTournamentStatus({ status: IN_PROGRESS });
  expect(result.success).toEqual(true);

  ({ tournamentInfo } = tournamentEngine.getTournamentInfo());
  expect(tournamentInfo.startDate).toEqual(anEarlierEndDate);

  expect(tournamentInfo.tournamentStatus).toEqual(IN_PROGRESS);
});

test('touramentInfo includes timeItemValues', () => {
  const tournamentDetailUpdates: any[] = [];
  setSubscriptions({
    subscriptions: { [MODIFY_TOURNAMENT_DETAIL]: (payload) => tournamentDetailUpdates.push(...payload) },
  });
  mocksEngine.generateTournamentRecord({ setState: true });
  const timeItem = { itemType: 'TEST', itemValue: 'value' };
  tournamentEngine.addTournamentTimeItem({ timeItem });
  const tournamentInfo = tournamentEngine.getTournamentInfo().tournamentInfo;
  expect(tournamentInfo.timeItemValues).toEqual({ TEST: 'value' });
  expect(tournamentDetailUpdates.length).toEqual(1);
  expect(tournamentDetailUpdates[0].timeItemValues).toEqual({ TEST: 'value' });

  let result = tournamentEngine.addTournamentTimeItem({ timeItem, removePriorValues: true });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getTournament();
  expect(result.tournamentRecord.timeItems.length).toEqual(1);

  // check that removing prior values works
  result = tournamentEngine.addTournamentTimeItem({ timeItem });
  expect(result.success).toEqual(true);
  result = tournamentEngine.getTournament();
  expect(result.tournamentRecord.timeItems.length).toEqual(2);
  result = tournamentEngine.addTournamentTimeItem({ timeItem, removePriorValues: true });
  expect(result.success).toEqual(true);
  result = tournamentEngine.getTournament();
  expect(result.tournamentRecord.timeItems.length).toEqual(1);
});

test('default getTournamentInfo does not include new dashboard fields', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });
  const { tournamentInfo } = tournamentEngine.getTournamentInfo();
  expect(tournamentInfo.matchUpStats).toBeUndefined();
  expect(tournamentInfo.individualParticipantCount).toBeUndefined();
  expect(tournamentInfo.eventCount).toBeUndefined();
  expect(tournamentInfo.structures).toBeUndefined();
  expect(tournamentInfo.venues).toBeUndefined();
});

test('withMatchUpStats returns individualParticipantCount, eventCount, and matchUpStats', () => {
  mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });
  const { tournamentInfo } = tournamentEngine.getTournamentInfo({ withMatchUpStats: true });

  expect(tournamentInfo.individualParticipantCount).toBeGreaterThan(0);
  expect(tournamentInfo.eventCount).toEqual(1);
  expect(tournamentInfo.matchUpStats).toBeDefined();
  expect(tournamentInfo.matchUpStats.total).toBeGreaterThan(0);
  expect(tournamentInfo.matchUpStats.completed).toEqual(tournamentInfo.matchUpStats.total);
  expect(tournamentInfo.matchUpStats.percentComplete).toEqual(100);
});

test('withMatchUpStats counts scheduled matchUps', () => {
  const startDate = '2024-01-01';
  const endDate = '2024-01-07';

  const {
    drawIds: [drawId],
    venueIds: [venueId],
  } = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 4 }],
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
    startDate,
    endDate,
  });

  // get first round matchUps
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const firstRoundMatchUps = matchUps.filter((m: any) => m.roundNumber === 1);
  const { courts } = tournamentEngine.getVenuesAndCourts();

  // schedule 2 matchUps
  for (let i = 0; i < 2 && i < firstRoundMatchUps.length; i++) {
    tournamentEngine.addMatchUpScheduleItems({
      matchUpId: firstRoundMatchUps[i].matchUpId,
      drawId,
      schedule: {
        scheduledDate: startDate,
        scheduledTime: `${startDate}T0${8 + i}:00`,
        venueId,
        courtId: courts[i % courts.length].courtId,
      },
    });
  }

  const { tournamentInfo } = tournamentEngine.getTournamentInfo({ withMatchUpStats: true });
  expect(tournamentInfo.matchUpStats.scheduled).toEqual(2);
  expect(tournamentInfo.matchUpStats.total).toBeGreaterThan(0);
  expect(tournamentInfo.matchUpStats.completed).toEqual(0);
  expect(tournamentInfo.matchUpStats.percentComplete).toEqual(0);
});

test('withStructureDetails returns flat structure array', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION }],
    setState: true,
  });
  const { tournamentInfo } = tournamentEngine.getTournamentInfo({ withStructureDetails: true });

  expect(tournamentInfo.structures).toBeDefined();
  expect(Array.isArray(tournamentInfo.structures)).toBe(true);
  expect(tournamentInfo.structures.length).toBeGreaterThan(0);

  for (const structure of tournamentInfo.structures) {
    expect(structure.eventId).toBeDefined();
    expect(structure.drawId).toBeDefined();
    expect(structure.structureId).toBeDefined();
    expect(structure.stage).toBeDefined();
  }
});

test('withVenueData returns venues with courts', () => {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 3 }],
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });
  const { tournamentInfo } = tournamentEngine.getTournamentInfo({ withVenueData: true });

  expect(tournamentInfo.venues).toBeDefined();
  expect(Array.isArray(tournamentInfo.venues)).toBe(true);
  expect(tournamentInfo.venues.length).toEqual(1);
  expect(tournamentInfo.venues[0].courts.length).toEqual(3);
});

test('all dashboard booleans can be combined', () => {
  mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    venueProfiles: [{ courtsCount: 2 }],
    drawProfiles: [{ drawSize: 8 }],
    setState: true,
  });
  const { tournamentInfo } = tournamentEngine.getTournamentInfo({
    withStructureDetails: true,
    withMatchUpStats: true,
    withVenueData: true,
  });

  expect(tournamentInfo.matchUpStats).toBeDefined();
  expect(tournamentInfo.individualParticipantCount).toBeGreaterThan(0);
  expect(tournamentInfo.eventCount).toEqual(1);
  expect(tournamentInfo.structures).toBeDefined();
  expect(tournamentInfo.structures.length).toBeGreaterThan(0);
  expect(tournamentInfo.venues).toBeDefined();
  expect(tournamentInfo.venues.length).toEqual(1);
});

test('getTournamentInfo returns registrationProfile when set', () => {
  mocksEngine.generateTournamentRecord({ setState: true });

  const registrationProfile = {
    entriesOpen: '2026-05-01',
    entriesClose: '2026-05-15',
    withdrawalDeadline: '2026-05-20',
    entryMethod: 'ONLINE',
    entryUrl: 'https://example.com/entry',
    dressCode: 'All-white',
    accommodation: {
      options: [{ name: 'Grand Hotel', priceRange: '$120-180/night', phone: '555-0100' }],
      notes: '<p>Negotiated rates available.</p>',
    },
    sponsors: [{ name: 'AcmeCorp', tier: 'TITLE', websiteUrl: 'https://acme.example' }],
  };

  let result: any = tournamentEngine.setRegistrationProfile({ registrationProfile });
  expect(result.success).toBe(true);

  const { tournamentInfo } = tournamentEngine.getTournamentInfo();
  expect(tournamentInfo.registrationProfile).toBeDefined();
  expect(tournamentInfo.registrationProfile.entriesOpen).toEqual('2026-05-01');
  expect(tournamentInfo.registrationProfile.entryMethod).toEqual('ONLINE');
  expect(tournamentInfo.registrationProfile.accommodation.options[0].name).toEqual('Grand Hotel');
  expect(tournamentInfo.registrationProfile.accommodation.notes).toContain('Negotiated rates');
  expect(tournamentInfo.registrationProfile.sponsors[0].tier).toEqual('TITLE');
});

test('empty tournament handles dashboard booleans gracefully', () => {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 0 },
    setState: true,
  });
  const { tournamentInfo } = tournamentEngine.getTournamentInfo({
    withMatchUpStats: true,
    withStructureDetails: true,
    withVenueData: true,
  });

  expect(tournamentInfo.individualParticipantCount).toEqual(0);
  expect(tournamentInfo.eventCount).toEqual(0);
  expect(tournamentInfo.matchUpStats).toEqual({ total: 0, completed: 0, scheduled: 0, percentComplete: 0 });
  expect(tournamentInfo.structures).toEqual([]);
  expect(tournamentInfo.venues).toEqual([]);
});

test('getTournamentInfo surfaces the owning provider (parentOrganisation)', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  tournamentRecord.parentOrganisation = { organisationId: 'BOBOCA', organisationName: 'Boboca Tennis' };
  const { tournamentInfo } = getTournamentInfo({ tournamentRecord });
  expect(tournamentInfo.parentOrganisation).toEqual({ organisationId: 'BOBOCA', organisationName: 'Boboca Tennis' });
});

test('getTournamentInfo omits parentOrganisation when the tournament has none', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord();
  delete tournamentRecord.parentOrganisation;
  const { tournamentInfo } = getTournamentInfo({ tournamentRecord });
  expect(tournamentInfo.parentOrganisation).toBeUndefined();
});
