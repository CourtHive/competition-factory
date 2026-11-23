import { setPracticeDefaultCapacity } from '@Mutate/practice/setPracticeDefaultCapacity';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';
import addFormats from 'ajv-formats';
import fs from 'fs-extra';
import Ajv from 'ajv';

/**
 * `Tournament.scheduling`, DESCRIBED.
 *
 * The schema declared `scheduling` as a bare object, so a record's scheduling profile, daily limits, timing, venue
 * transits, scenarios and practice defaults were never validated. They are now closed definitions. A read-only census
 * of production (2026-11-02, key paths only) found `scheduling.profile` alone, with rounds naming tournamentId,
 * eventId, drawId, structureId and roundNumber; every other leaf is written by the methods exercised below.
 */

const schema = JSON.parse(fs.readFileSync('./src/global/schema/tournament.schema.json', { encoding: 'utf8' }));
const ajv = new Ajv({ allowUnionTypes: true, allErrors: true });
ajv.addFormat('date-time', (dateTime: any) => {
  if (typeof dateTime === 'object') dateTime = dateTime.toISOString();
  return !Number.isNaN(Date.parse(dateTime));
});
addFormats(ajv);
ajv.addSchema(schema, 'codes');
const validateRecord = ajv.getSchema('codes')!;
const validateScheduling = ajv.getSchema('codes#/definitions/TournamentScheduling')!;

function errorsOf(validate: any, value: any): string | undefined {
  return validate(value) ? undefined : ajv.errorsText(validate.errors);
}

const DATE = '2026-06-15';
const round = { tournamentId: 't', eventId: 'e', drawId: 'd', structureId: 's', roundNumber: 1 };

describe('Tournament.scheduling', () => {
  it('accepts the profile shape production stores', () => {
    const profile = [{ scheduleDate: DATE, venues: [{ venueId: 'v', rounds: [round, { ...round, roundNumber: 2 }] }] }];
    expect(errorsOf(validateScheduling, { profile })).toBeUndefined();
  });

  it('accepts every documented round attribute, and a profile date with no venues', () => {
    const documented = {
      ...round,
      roundSegment: { segmentNumber: 1, segmentsCount: 2 },
      notBeforeTime: '11:00',
      periodLength: 15,
      matchUpIds: ['m1'],
      containerStructureId: 'c',
      isRoundRobin: true,
      eventName: 'Open',
      roundName: 'R16',
      sortOrder: 1,
    };
    const profile = [{ scheduleDate: DATE, venues: [{ venueId: 'v', rounds: [documented] }] }, { scheduleDate: DATE }];
    expect(errorsOf(validateScheduling, { profile })).toBeUndefined();
  });

  it.each([
    ['a profile date without its scheduleDate', { profile: [{ venues: [] }] }],
    [
      'a profile round attribute nothing declares',
      { profile: [{ scheduleDate: DATE, venues: [{ venueId: 'v', rounds: [{ ...round, roundTypo: 1 }] }] }] },
    ],
    [
      'a round period that is not positive',
      { profile: [{ scheduleDate: DATE, venues: [{ venueId: 'v', rounds: [{ ...round, periodLength: 0 }] }] }] },
    ],
    ['a venue transit naming three venues', { venueTransits: [{ venueIds: ['a', 'b', 'c'], minutes: 10 }] }],
    ['a daily limit counter nothing reads', { dailyLimits: { dailyLimits: { MIXED: 2 } } }],
    ['a scenario without placements', { scenarios: [{ scenarioId: 's', scenarioName: 'Plan' }] }],
    ['a leaf nothing declares', { grid: {} }],
  ])('rejects %s', (_, scheduling) => {
    expect(validateScheduling(scheduling)).toEqual(false);
  });

  it('a record written by every method that stores a scheduling leaf validates', () => {
    const {
      tournamentRecord: { tournamentId },
      venueIds: [venueId, otherVenueId],
      drawIds: [drawId],
    } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 2 }, { courtsCount: 2 }],
      drawProfiles: [{ drawSize: 8 }],
      startDate: DATE,
      endDate: DATE,
      setState: true,
    });

    const { drawDefinition, event } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const { matchUpId } = matchUps[0];
    const profileRound = { tournamentId, eventId: event.eventId, drawId, structureId, roundNumber: 1 };

    let result: any = tournamentEngine.setSchedulingProfile({
      schedulingProfile: [
        { scheduleDate: DATE, venues: [{ venueId, rounds: [{ ...profileRound, notBeforeTime: '09:00' }] }] },
      ],
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.setMatchUpDailyLimits({ dailyLimits: { SINGLES: 2, DOUBLES: 1, total: 3 } });
    expect(result.success).toEqual(true);
    result = tournamentEngine.modifyMatchUpFormatTiming({
      matchUpFormat: 'SET3-S:6/TB7',
      averageTimes: [{ categoryTypes: ['JUNIOR'], minutes: { default: 80 } }],
      recoveryTimes: [{ categoryTypes: ['JUNIOR'], minutes: { default: 45 } }],
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.setVenueTransit({ venueIds: [venueId, otherVenueId], minutes: 25 });
    expect(result.success).toEqual(true);
    const schedule = { scheduledDate: DATE, scheduledTime: '10:00', venueId };
    result = tournamentEngine.addScheduleScenario({
      scenario: {
        scenarioName: 'Rain plan',
        scheduledDates: [DATE],
        placements: [{ tournamentId, matchUpId, schedule }],
      },
    });
    expect(result.success).toEqual(true);

    const { tournamentRecord } = tournamentEngine.getTournament();
    result = setPracticeDefaultCapacity({ tournamentRecord, defaultCapacity: 4 });
    expect(result.success).toEqual(true);

    // CONTROL: every leaf is on the record, so the validation below is about it
    expect(Object.keys(tournamentRecord.scheduling ?? {}).toSorted()).toEqual(
      ['dailyLimits', 'practice', 'profile', 'scenarios', 'timing', 'venueTransits'].toSorted(),
    );
    expect(errorsOf(validateScheduling, tournamentRecord.scheduling)).toBeUndefined();
    expect(errorsOf(validateRecord, tournamentRecord)).toBeUndefined();
  });
});
