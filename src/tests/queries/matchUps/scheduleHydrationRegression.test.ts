/**
 * Locks down the shape of `competitionScheduleMatchUps` output that
 * courthive-public (and TMX) read on every schedule page render. The
 * server's `/factory/scheduledmatchups` endpoint calls this method, and
 * a recent report claimed venueName / courtName had disappeared from
 * the returned matchUps after the CODES Phase 2 / Phase 4 releases
 * (factory 5.x). These assertions exist so any future change that
 * silently drops a name field from the schedule shape will fail here.
 *
 * If a future change *intentionally* renames or removes any of these
 * fields, update this test AND notify the courthive-public maintainer
 * in the same PR — these are part of the public API contract of the
 * server's scheduled-matchups response.
 */
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

function scheduleOneMatchUp(opts: { startDate: string }) {
  const venueProfiles = [
    {
      venueName: 'Club Courts',
      venueAbbreviation: 'CC',
      courtsCount: 4,
      startTime: '08:00',
      endTime: '20:00',
    },
  ];
  const drawProfiles = [{ drawSize: 8, eventType: 'SINGLES' }];

  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    startDate: opts.startDate,
    venueProfiles,
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  const venueId = tournamentRecord.venues[0].venueId;
  const courtId = tournamentRecord.venues[0].courts[0].courtId;
  const courtName = tournamentRecord.venues[0].courts[0].courtName;
  const venueName = tournamentRecord.venues[0].venueName;
  const matchUpId = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps[0].matchUpId;
  const drawId = tournamentRecord.events[0].drawDefinitions[0].drawId;
  const eventId = tournamentRecord.events[0].eventId;

  expect(tournamentEngine.assignMatchUpVenue({ drawId, matchUpId, venueId }).success).toEqual(true);
  expect(tournamentEngine.assignMatchUpCourt({ drawId, matchUpId, courtId }).success).toEqual(true);
  expect(
    tournamentEngine.addMatchUpScheduledDate({ drawId, matchUpId, scheduledDate: opts.startDate }).success,
  ).toEqual(true);
  expect(tournamentEngine.addMatchUpScheduledTime({ drawId, matchUpId, scheduledTime: '10:00' }).success).toEqual(true);

  return { venueId, courtId, courtName, venueName, matchUpId, drawId, eventId, tournamentRecord };
}

describe('competitionScheduleMatchUps — public API shape', () => {
  it('hydrates schedule.venueName and schedule.courtName on dateMatchUps', () => {
    const startDate = '2026-05-05';
    const { matchUpId, venueId, courtId, venueName, courtName } = scheduleOneMatchUp({ startDate });

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      usePublishState: false,
    });

    const target = result.dateMatchUps.find((m: any) => m.matchUpId === matchUpId);
    expect(target, 'expected scheduled matchUp to appear in dateMatchUps').toBeDefined();

    expect(target.schedule.venueId).toEqual(venueId);
    expect(target.schedule.courtId).toEqual(courtId);
    expect(target.schedule.venueName).toEqual(venueName);
    expect(target.schedule.courtName).toEqual(courtName);
    expect(target.schedule.scheduledDate).toEqual(startDate);
    expect(target.schedule.scheduledTime).toEqual('10:00');
  });

  it('hydrates the same names when called through the publish-state code path', () => {
    const startDate = '2026-05-05';
    const { matchUpId, venueName, courtName, eventId } = scheduleOneMatchUp({ startDate });

    tournamentEngine.publishOrderOfPlay();
    tournamentEngine.publishEvent({ eventId });

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      usePublishState: true,
    });

    const target = result.dateMatchUps.find((m: any) => m.matchUpId === matchUpId);
    expect(target).toBeDefined();
    expect(target.schedule.venueName).toEqual(venueName);
    expect(target.schedule.courtName).toEqual(courtName);
  });

  it('returns venueName + courtName on the top-level venues[] array', () => {
    const startDate = '2026-05-05';
    const { venueId, courtId, venueName, courtName } = scheduleOneMatchUp({ startDate });

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      usePublishState: false,
    });

    const venue = result.venues?.find((v: any) => v.venueId === venueId);
    expect(venue).toBeDefined();
    expect(venue.venueName).toEqual(venueName);

    const court = venue.courts.find((c: any) => c.courtId === courtId);
    expect(court).toBeDefined();
    expect(court.courtName).toEqual(courtName);
  });

  it('returns courtName on courtsData[] entries', () => {
    const startDate = '2026-05-05';
    const { courtId, courtName } = scheduleOneMatchUp({ startDate });

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      usePublishState: false,
    });

    const court = result.courtsData?.find((c: any) => c.courtId === courtId);
    expect(court).toBeDefined();
    expect(court.courtName).toEqual(courtName);
  });

  it('returns lowercase id field names on schedule (venueId / courtId, not VENUE_ID / COURT_ID)', () => {
    const startDate = '2026-05-05';
    const { matchUpId } = scheduleOneMatchUp({ startDate });

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      usePublishState: false,
    });

    const target = result.dateMatchUps.find((m: any) => m.matchUpId === matchUpId);
    const keys = Object.keys(target.schedule);

    // Locks down the lowercase camelCase contract — if any of these
    // start coming back as SCHEDULED_DATE / ASSIGN_VENUE / ASSIGN_COURT
    // (the underlying timeItem itemType constants), it'd be a regression.
    expect(keys).toContain('venueId');
    expect(keys).toContain('courtId');
    expect(keys).toContain('scheduledDate');
    expect(keys).toContain('scheduledTime');

    for (const upperKey of [
      'VENUE_ID',
      'COURT_ID',
      'SCHEDULED_DATE',
      'SCHEDULED_TIME',
      'SCHEDULE.ASSIGNMENT.VENUE',
      'SCHEDULE.ASSIGNMENT.COURT',
      'SCHEDULE.DATE',
      'SCHEDULE.TIME.SCHEDULED',
    ]) {
      expect(keys, `schedule must not surface raw itemType "${upperKey}"`).not.toContain(upperKey);
    }
  });

  it('preserves the exact case of caller-supplied venueId / courtId end-to-end (addVenue + addCourt + assignment + read)', () => {
    // Reported bug shape: caller posts lowercase UUIDs via the addVenue +
    // addCourt mutations and reads them back uppercased. These IDs are
    // the literal payloads from the user's report.
    const venueId = '8465e143-8af4-482a-9860-6f3b25a86702';
    const courtId = 'e77352e9-5561-4bba-8712-133586eab125';
    const startDate = '2026-05-05';

    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: 'SINGLES' }],
      startDate,
    });
    tournamentEngine.setState(tournamentRecord);

    const av: any = tournamentEngine.addVenue({
      venue: { venueName: 'Rick Macci Tennis Academy', venueAbbreviation: 'RMTA', venueId },
    });
    expect(av.venue?.venueId).toEqual(venueId);

    const ac: any = tournamentEngine.addCourt({
      venueId,
      court: { courtName: 'Court 1', surfaceCategory: 'HARD', courtId },
    });
    expect(ac.court?.courtId).toEqual(courtId);
    expect(ac.venueId).toEqual(venueId);

    const drawId = tournamentRecord.events[0].drawDefinitions[0].drawId;
    const matchUpId = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps[0].matchUpId;
    expect(tournamentEngine.assignMatchUpVenue({ drawId, matchUpId, venueId }).success).toEqual(true);
    expect(tournamentEngine.assignMatchUpCourt({ drawId, matchUpId, courtId }).success).toEqual(true);
    expect(tournamentEngine.addMatchUpScheduledDate({ drawId, matchUpId, scheduledDate: startDate }).success).toEqual(
      true,
    );

    const result = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
      usePublishState: false,
    });
    const target = result.dateMatchUps.find((m: any) => m.matchUpId === matchUpId);
    expect(target?.schedule?.venueId).toEqual(venueId);
    expect(target?.schedule?.courtId).toEqual(courtId);

    const venue = result.venues?.find((v: any) => v.venueId === venueId);
    expect(venue?.venueId).toEqual(venueId);
    expect(venue?.courts?.find((c: any) => c.courtId === courtId)?.courtId).toEqual(courtId);
  });
});
