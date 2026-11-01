import { checkSchedulingReport } from '@Tests/testHarness/scheduling/schedulingReportProperties';
import { schedulingReport } from '@Tests/testHarness/scheduling/schedulingReport';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { EVENT_DATE_INACTIVE } from '@Constants/errorConditionConstants';
import { AUTO_SCHEDULING_AUDIT } from '@Constants/auditConstants';

// 2026-11-13 is a Friday; the tournament runs Fri 13 .. Mon 16
const startDate = '2026-11-13';
const endDate = '2026-11-16';
const FRI = '2026-11-13';
const SAT = '2026-11-14';
const venueId = 'venue';

/**
 * Two events on the same days, one playing Saturdays only and one Fridays only: auto-scheduling skips per EVENT, so on
 * the Friday the Saturday event is skipped and the Friday event is scheduled.
 */
function setup({ profile = true } = {}) {
  mocksEngine.generateTournamentRecord({
    eventProfiles: [
      { eventId: 'satEvent', eventName: 'Saturday', drawProfiles: [{ drawSize: 8, drawId: 'satDraw' }] },
      { eventId: 'friEvent', eventName: 'Friday', drawProfiles: [{ drawSize: 8, drawId: 'friDraw' }] },
    ],
    venueProfiles: [{ venueId, courtsCount: 8, startTime: '08:00', endTime: '20:00' }],
    setState: true,
    startDate,
    endDate,
  });
  tournamentEngine.setEventDates({ eventId: 'satEvent', weekdays: ['SAT'] });
  tournamentEngine.setEventDates({ eventId: 'friEvent', weekdays: ['FRI'] });

  const { tournamentId } = tournamentEngine.getTournament().tournamentRecord;
  const r1 = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
  const ids = (eventId: string) => r1.filter((m) => m.eventId === eventId).map(({ matchUpId }) => matchUpId);

  if (profile) {
    for (const [eventId, drawId] of [
      ['satEvent', 'satDraw'],
      ['friEvent', 'friDraw'],
    ]) {
      const { drawDefinition } = tournamentEngine.getEvent({ drawId });
      const structureId = drawDefinition.structures[0].structureId;
      const round = { tournamentId, eventId, drawId, structureId, roundNumber: 1 };
      const result = tournamentEngine.addSchedulingProfileRound({ scheduleDate: FRI, venueId, round });
      expect(result.success).toEqual(true);
    }
  }
  return { sat: ids('satEvent'), fri: ids('friEvent') };
}

const scheduledOn = (date: string) =>
  new Set(
    tournamentEngine
      .allTournamentMatchUps()
      .matchUps.filter((m) => m.schedule?.scheduledDate === date)
      .map(({ matchUpId }) => matchUpId),
  );
const sorted = (ids: string[]) => [...ids].sort((a, b) => a.localeCompare(b));
const skippedIds = (result: any, date: string) =>
  sorted(result.eventDateSkippedMatchUpIds[date].map((s) => s.matchUpId));

describe('scheduleProfileRounds', () => {
  it('skips per event the rounds whose event does not play on the date, and reports them', () => {
    const { sat, fri } = setup();
    const before = structuredClone(tournamentEngine.getTournament().tournamentRecord);

    const result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [FRI] });
    expect(result.success).toEqual(true);

    const placed = scheduledOn(FRI);
    expect(fri.every((id) => placed.has(id))).toEqual(true);
    expect(sat.some((id) => placed.has(id))).toEqual(false);
    expect(sorted(result.scheduledMatchUpIds[FRI])).toEqual(sorted(fri));

    expect(skippedIds(result, FRI)).toEqual(sorted(sat));
    expect(result.eventDateSkippedMatchUpIds[FRI][0]).toEqual({
      matchUpId: result.eventDateSkippedMatchUpIds[FRI][0].matchUpId,
      reason: 'EVENT_WEEKDAY',
      eventId: 'satEvent',
    });
    // a reason of its own, kept out of noTimeMatchUpIds
    expect(result.noTimeMatchUpIds[FRI].some((id) => sat.includes(id))).toEqual(false);
    expect(result.warnings).toBeUndefined();

    // every profiled matchUp left unplaced is accounted for
    const after = tournamentEngine.getTournament().tournamentRecord;
    const report = schedulingReport('scheduleProfileRounds', result);
    expect(report?.eventDateSkippedMatchUpIds).toEqual({ [FRI]: sorted(sat) });
    expect(checkSchedulingReport({ before, after, params: { scheduleDates: [FRI] }, report })).toEqual([]);

    // the audit counts the skips
    const { timeItems } = tournamentEngine.getTournament().tournamentRecord;
    const audit = timeItems.find(({ itemType }) => itemType === AUTO_SCHEDULING_AUDIT);
    expect(audit.itemValue.eventDateSkippedMatchUpIdsCount).toEqual(sat.length);
  });

  it('a dry run reports the same skips and writes nothing', () => {
    const { sat } = setup();
    const result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [FRI], dryRun: true });
    expect(result.success).toEqual(true);
    expect(skippedIds(result, FRI)).toEqual(sorted(sat));
    expect(scheduledOn(FRI).size).toEqual(0);
  });

  it('allowInactiveEventDates places them and warns', () => {
    const { sat, fri } = setup();
    const result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [FRI], allowInactiveEventDates: true });
    expect(result.success).toEqual(true);
    const placed = scheduledOn(FRI);
    expect([...sat, ...fri].every((id) => placed.has(id))).toEqual(true);
    expect(result.eventDateSkippedMatchUpIds).toBeUndefined();
    expect(sorted(result.warnings.map(({ matchUpId }) => matchUpId))).toEqual(sorted(sat));
    expect(result.warnings[0]).toMatchObject({
      ...EVENT_DATE_INACTIVE,
      scheduledDate: FRI,
      reason: 'EVENT_WEEKDAY',
      eventId: 'satEvent',
    });
  });

  it('an unconstrained call is unchanged: no skips member, no warnings', () => {
    setup();
    tournamentEngine.setEventDates({ eventId: 'satEvent', weekdays: [] });
    const result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [FRI] });
    expect(result.success).toEqual(true);
    expect(result.eventDateSkippedMatchUpIds).toBeUndefined();
    expect(result.warnings).toBeUndefined();
    const { timeItems } = tournamentEngine.getTournament().tournamentRecord;
    const audit = timeItems.find(({ itemType }) => itemType === AUTO_SCHEDULING_AUDIT);
    expect('eventDateSkippedMatchUpIdsCount' in audit.itemValue).toEqual(false);
  });

  it('honours event activeDates over weekdays, and the event range', () => {
    const { sat } = setup();
    // activeDates win: the Saturday event now plays the Friday
    tournamentEngine.setEventDates({ eventId: 'satEvent', activeDates: [FRI] });
    let result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [FRI], dryRun: true });
    expect(result.eventDateSkippedMatchUpIds).toBeUndefined();

    // a range that starts on the Saturday excludes the Friday
    tournamentEngine.setEventDates({ eventId: 'satEvent', activeDates: [], startDate: SAT });
    result = tournamentEngine.scheduleProfileRounds({ scheduleDates: [FRI], dryRun: true });
    expect(skippedIds(result, FRI)).toEqual(sorted(sat));
    expect(result.eventDateSkippedMatchUpIds[FRI][0].reason).toEqual('OUTSIDE_EVENT_DATES');
  });
});

describe('scheduleProfileGrid', () => {
  it('skips per event, and reports the skips apart from notScheduledMatchUpIds', () => {
    const { sat, fri } = setup();
    const result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [FRI] });
    expect(result.success).toEqual(true);
    expect(sorted(result.scheduledMatchUpIds[FRI])).toEqual(sorted(fri));
    expect(skippedIds(result, FRI)).toEqual(sorted(sat));
    expect((result.notScheduledMatchUpIds[FRI] ?? []).some((id) => sat.includes(id))).toEqual(false);
    const placed = scheduledOn(FRI);
    expect(sat.some((id) => placed.has(id))).toEqual(false);
  });

  it('allowInactiveEventDates places them and warns', () => {
    const { sat } = setup();
    const result: any = tournamentEngine.scheduleProfileGrid({ scheduleDates: [FRI], allowInactiveEventDates: true });
    expect(result.success).toEqual(true);
    expect(result.eventDateSkippedMatchUpIds).toBeUndefined();
    expect(sat.every((id) => scheduledOn(FRI).has(id))).toEqual(true);
    const warned = result.warnings.filter(({ code }) => code === EVENT_DATE_INACTIVE.code);
    expect(sorted(warned.map(({ matchUpId }) => matchUpId))).toEqual(sorted(sat));
  });
});

describe('proAutoSchedule', () => {
  it('skips per event: not scheduled, and reported why', () => {
    const { sat, fri } = setup({ profile: false });
    const matchUps = tournamentEngine
      .allTournamentMatchUps({ inContext: true, nextMatchUps: true })
      .matchUps.filter(({ roundNumber }) => roundNumber === 1);
    let result: any = tournamentEngine.proAutoSchedule({ scheduledDate: FRI, matchUps });
    expect(result.success).toEqual(true);
    expect(sorted(result.scheduled.map(({ matchUpId }) => matchUpId))).toEqual(sorted(fri));
    expect(sorted(result.notScheduled.map(({ matchUpId }) => matchUpId))).toEqual(sorted(sat));
    expect(skippedIds(result, FRI)).toEqual(sorted(sat));

    // allowed, they are placed, and the write warns
    const fresh = tournamentEngine
      .allTournamentMatchUps({ inContext: true, nextMatchUps: true })
      .matchUps.filter(({ matchUpId }) => sat.includes(matchUpId));
    result = tournamentEngine.proAutoSchedule({ scheduledDate: FRI, matchUps: fresh, allowInactiveEventDates: true });
    expect(result.success).toEqual(true);
    expect(sorted(result.scheduled.map(({ matchUpId }) => matchUpId))).toEqual(sorted(sat));
    expect(result.warnings.filter(({ code }) => code === EVENT_DATE_INACTIVE.code)).toHaveLength(sat.length);
  });
});

describe('scheduleMatchUps', () => {
  it('skips per event, reported in eventDateSkippedMatchUpIds and noTimeMatchUpIds', () => {
    const { sat, fri } = setup({ profile: false });
    const result: any = tournamentEngine.scheduleMatchUps({ scheduleDate: FRI, matchUpIds: [...sat, ...fri] });
    expect(result.success).toEqual(true);
    expect(sorted(result.scheduledMatchUpIds)).toEqual(sorted(fri));
    expect(skippedIds(result, FRI)).toEqual(sorted(sat));
    expect(sat.every((id) => result.noTimeMatchUpIds.includes(id))).toEqual(true);
    const placed = scheduledOn(FRI);
    expect(sat.some((id) => placed.has(id))).toEqual(false);
  });

  it('allowInactiveEventDates places them and warns', () => {
    const { sat, fri } = setup({ profile: false });
    const result: any = tournamentEngine.scheduleMatchUps({
      matchUpIds: [...sat, ...fri],
      allowInactiveEventDates: true,
      scheduleDate: FRI,
    });
    expect(result.success).toEqual(true);
    expect(sorted(result.scheduledMatchUpIds)).toEqual(sorted([...sat, ...fri]));
    expect(result.eventDateSkippedMatchUpIds).toBeUndefined();
    expect(sorted(result.warnings.map(({ matchUpId }) => matchUpId))).toEqual(sorted(sat));
    expect(result.warnings[0]).toMatchObject({ ...EVENT_DATE_INACTIVE, scheduledDate: FRI, eventId: 'satEvent' });
  });
});
