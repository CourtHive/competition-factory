import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { getDrawData } from '@Query/drawDefinition/getDrawData';
import { findMatchUp } from '@Acquire/findMatchUp';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test, vi } from 'vitest';

// constants and types
import { TEAM } from '@Constants/eventConstants';

// Venue data used to be rebuilt for every scheduled matchUp: getVenueData projects every court, and each
// court is found by scanning every venue (assessment 2026-10-16 H2). It is now built once per venue per read.

const calls = vi.hoisted(() => ({ getVenueData: 0 }));

vi.mock('@Query/venues/getVenueData', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    getVenueData: (params) => {
      calls.getVenueData += 1;
      return actual.getVenueData(params);
    },
  };
});

function countCalls(fn: () => any) {
  calls.getVenueData = 0;
  const result = fn();
  return { result, count: calls.getVenueData };
}

const courts = (venueId: string, count: number, prefix: string) =>
  Array.from({ length: count }, (_, i) => ({ courtId: `${prefix}${i}`, courtName: `${prefix} court ${i}`, venueId }));

function getRecord(eventType?: string) {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: eventType === TEAM ? 4 : 16, ...(eventType ? { eventType } : {}) }],
  });
  tournamentRecord.venues = [
    { venueId: 'v1', venueName: 'Venue One', venueAbbreviation: 'V1', courts: courts('v1', 4, 'a') },
    { venueId: 'v2', venueName: 'Venue Two', venueAbbreviation: 'V2', courts: courts('v2', 4, 'b') },
  ];
  const structure = tournamentRecord.events[0].drawDefinitions[0].structures[0];
  structure.matchUps.forEach((matchUp, i) => {
    const venueId = i % 2 ? 'v2' : 'v1';
    const courtId = `${i % 2 ? 'b' : 'a'}${i % 4}`;
    matchUp.schedule = {
      allocatedCourts: [
        { venueId: 'v1', courtId: 'a3' },
        { venueId: 'v2', courtId: 'b3' },
        { venueId: 'unknown', courtId: 'x' },
      ],
      scheduledDate: '2026-10-16',
      venueId,
      courtId,
    };
    matchUp.tieMatchUps?.forEach(
      (tieMatchUp) => (tieMatchUp.schedule = { ...matchUp.schedule, venueId: 'v1', courtId: 'a2' }),
    );
  });
  structure.matchUps[0].schedule.venueId = 'unknown';
  return { tournamentRecord, structure };
}

test('venue and court names are resolved for every matchUp, including allocated courts and unknown venues', () => {
  const { tournamentRecord, structure } = getRecord();
  const matchUps: any = allTournamentMatchUps({ tournamentRecord }).matchUps;
  expect(matchUps.length).toEqual(structure.matchUps.length);

  for (const matchUp of matchUps) {
    const { venueId, courtId, venueName, venueAbbreviation, courtName, allocatedCourts } = matchUp.schedule;
    const venue = tournamentRecord.venues.find((v) => v.venueId === venueId);
    expect(venueName).toEqual(venue?.venueName);
    expect(venueAbbreviation).toEqual(venue?.venueAbbreviation);
    expect(courtName).toEqual(venue?.courts.find((c) => c.courtId === courtId)?.courtName);
    expect(allocatedCourts.map((court) => [court.venueName, court.courtName])).toEqual([
      ['Venue One', 'a court 3'],
      ['Venue Two', 'b court 3'],
      [undefined, undefined],
    ]);
  }
  const unknownVenue = matchUps.find((m) => m.matchUpId === structure.matchUps[0].matchUpId);
  expect(unknownVenue.schedule.venueId).toEqual('unknown');
  expect(unknownVenue.schedule.venueName).toBeUndefined();
  expect(unknownVenue.schedule.courtName).toBeUndefined();
});

test('venue data is built once per venue per read, not once per matchUp', () => {
  const { tournamentRecord, structure } = getRecord();
  expect(structure.matchUps.length).toEqual(15);

  // two known venues and one unknown, each looked up once: a miss is remembered too
  expect(countCalls(() => allTournamentMatchUps({ tournamentRecord })).count).toEqual(3);
  const { drawDefinition, event } = {
    drawDefinition: tournamentRecord.events[0].drawDefinitions[0],
    event: tournamentRecord.events[0],
  };
  expect(countCalls(() => getDrawData({ tournamentRecord, drawDefinition, event })).count).toEqual(3);
});

test('TEAM lines share the read’s venue data with their duals', () => {
  const { tournamentRecord } = getRecord(TEAM);
  const { result, count } = countCalls(() => allTournamentMatchUps({ tournamentRecord }));
  const lines = (result.matchUps ?? []).filter((matchUp) => matchUp.matchUpTieId);
  expect(lines.length).toBeGreaterThan(0);
  expect(lines.every((line: any) => line.schedule.courtName === 'a court 2')).toEqual(true);
  expect(count).toEqual(3);

  const line: any = lines[0];
  const found = countCalls(() => findMatchUp({ tournamentRecord, matchUpId: line.matchUpId, inContext: true }));
  expect(found.result.matchUp.schedule).toEqual(line.schedule);
  expect(found.count).toBeLessThanOrEqual(3);
});

test('nothing survives the read: a renamed venue or court is seen by the next read', () => {
  const { tournamentRecord, structure } = getRecord();
  const matchUpId = structure.matchUps[2].matchUpId; // v1, court a2
  const read = () =>
    (allTournamentMatchUps({ tournamentRecord }).matchUps ?? []).find((m) => m.matchUpId === matchUpId);

  expect(read()?.schedule?.courtName).toEqual('a court 2');
  tournamentRecord.venues[0].venueName = 'Renamed Venue';
  tournamentRecord.venues[0].courts[2].courtName = 'Renamed Court';
  expect(read()?.schedule?.venueName).toEqual('Renamed Venue');
  expect(read()?.schedule?.courtName).toEqual('Renamed Court');
});

test('a returned schedule is the caller’s: editing it changes neither the record nor the next read', () => {
  const { tournamentRecord } = getRecord();
  const before = JSON.stringify(tournamentRecord);
  const first: any = allTournamentMatchUps({ tournamentRecord }).matchUps;
  first.forEach((matchUp) => {
    matchUp.schedule.venueName = 'EDITED';
    matchUp.schedule.allocatedCourts[0].courtName = 'EDITED';
  });
  expect(JSON.stringify(tournamentRecord)).toEqual(before);

  const second: any = allTournamentMatchUps({ tournamentRecord }).matchUps;
  expect(second.some((matchUp) => matchUp.schedule.venueName === 'EDITED')).toEqual(false);
  expect(second.some((matchUp) => matchUp.schedule.allocatedCourts[0].courtName === 'EDITED')).toEqual(false);
});
