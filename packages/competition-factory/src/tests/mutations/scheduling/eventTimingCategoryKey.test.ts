import { getScheduleTiming } from '@Query/extensions/matchUpFormatTiming/getScheduleTiming';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants and fixtures
import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import { SCHEDULE_TIMING } from '@Constants/extensionConstants';

/**
 * An event's timing override is written by `modifyEventMatchUpFormatTiming` under one category key: the category's
 * name, else its age category code, else the event's own eventId. Every reader must resolve the same key. Readers
 * that stopped at the category read the policy default for an event with no category, so the readout
 * (`getEventMatchUpFormatTiming`, which added the eventId fallback itself) and the schedulers disagreed.
 */

const DATE = '2026-06-22';
const POLICY = {
  scheduling: {
    defaultTimes: {
      averageTimes: [{ minutes: { default: 90 } }],
      recoveryTimes: [{ minutes: { default: 60 } }],
    },
  },
};

function scenario() {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 1, venueId: 'venueId', startTime: '08:00', endTime: '23:00' }],
    drawProfiles: [
      { drawSize: 8, drawId: 'plainDraw', eventId: 'plain', matchUpFormat: FORMAT_STANDARD },
      { drawSize: 8, drawId: 'otherDraw', eventId: 'other', matchUpFormat: FORMAT_STANDARD },
      {
        category: { categoryName: 'OPEN' },
        matchUpFormat: FORMAT_STANDARD,
        drawId: 'openDraw',
        eventId: 'open',
        drawSize: 8,
      },
    ],
    startDate: DATE,
    endDate: DATE,
    setState: true,
  });
  expect(tournamentEngine.attachPolicies({ policyDefinitions: POLICY }).success).toEqual(true);
}

function override(eventId: string) {
  const result: any = tournamentEngine.modifyEventMatchUpFormatTiming({
    matchUpFormat: FORMAT_STANDARD,
    recoveryMinutes: 30,
    averageMinutes: 75,
    eventId,
  });
  expect(result.success).toEqual(true);
}

function formatTiming(eventId: string) {
  const { averageMinutes, recoveryMinutes } = tournamentEngine.getMatchUpFormatTiming({
    matchUpFormat: FORMAT_STANDARD,
    eventId,
  });
  return { averageMinutes, recoveryMinutes };
}

function eventReadout(eventId: string) {
  const { eventMatchUpFormatTiming } = tournamentEngine.getEventMatchUpFormatTiming({
    matchUpFormats: [FORMAT_STANDARD],
    eventId,
  });
  const { averageMinutes, recoveryMinutes } = eventMatchUpFormatTiming[0];
  return { averageMinutes, recoveryMinutes };
}

function scheduleTimingOf(eventId: string) {
  const tournamentRecord = tournamentEngine.getTournament().tournamentRecord;
  const { event } = tournamentEngine.getEvent({ eventId });
  return getScheduleTiming({ tournamentRecord, event }).scheduleTiming;
}

const OVERRIDE = { averageMinutes: 75, recoveryMinutes: 30 };
const DEFAULT = { averageMinutes: 90, recoveryMinutes: 60 };

describe('an event timing override is read under the key it is written under', () => {
  it('an event with no category reads its override through every reader', () => {
    scenario();
    expect(tournamentEngine.getEvent({ eventId: 'plain' }).event.category).toBeUndefined();
    override('plain');

    // written under the eventId
    const { event } = tournamentEngine.getEvent({ eventId: 'plain' });
    const timing = event.extensions.find(({ name }) => name === SCHEDULE_TIMING).value;
    expect(timing.matchUpAverageTimes[0].averageTimes[0].categoryNames).toEqual(['plain']);

    expect(scheduleTimingOf('plain').categoryName).toEqual('plain');
    expect(formatTiming('plain')).toEqual(OVERRIDE);
    expect(eventReadout('plain')).toEqual(OVERRIDE);

    // passing the event rather than its id reads the same
    const tournamentRecord = tournamentEngine.getTournament().tournamentRecord;
    const { averageMinutes, recoveryMinutes } = tournamentEngine.getMatchUpFormatTiming({
      matchUpFormat: FORMAT_STANDARD,
      tournamentRecord,
      event,
    });
    expect({ averageMinutes, recoveryMinutes }).toEqual(OVERRIDE);

    // another event with no category stays on the policy
    expect(scheduleTimingOf('other').categoryName).toEqual('other');
    expect(formatTiming('other')).toEqual(DEFAULT);
    expect(eventReadout('other')).toEqual(DEFAULT);
  });

  it('a categorized event reads its override under its category name', () => {
    scenario();
    override('open');
    expect(scheduleTimingOf('open').categoryName).toEqual('OPEN');
    expect(formatTiming('open')).toEqual(OVERRIDE);
    expect(eventReadout('open')).toEqual(OVERRIDE);
    expect(formatTiming('plain')).toEqual(DEFAULT);
  });

  it('removing the override returns the event to the policy', () => {
    scenario();
    override('plain');
    expect(formatTiming('plain')).toEqual(OVERRIDE);
    expect(tournamentEngine.removeEventMatchUpFormatTiming({ eventId: 'plain' }).success).toEqual(true);
    expect(formatTiming('plain')).toEqual(DEFAULT);
    expect(eventReadout('plain')).toEqual(DEFAULT);
  });
});

function roundOneMatchUpIds(drawId: string) {
  return tournamentEngine
    .allTournamentMatchUps({ matchUpFilters: { drawIds: [drawId], roundNumbers: [1] } })
    .matchUps.map(({ matchUpId }) => matchUpId);
}

function minutesOf(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * The minutes between consecutive scheduled starts on the single court, from the second start on. The gap between the
 * first two starts is 60 whatever the average (it is so on dev before this change too), so it is left out: the
 * spacing the average decides is the rest of the gaps.
 */
function scheduledGaps(drawId: string) {
  const times = tournamentEngine
    .allTournamentMatchUps({ matchUpFilters: { drawIds: [drawId], roundNumbers: [1] } })
    .matchUps.map(({ schedule }) => minutesOf(schedule?.scheduledTime))
    .sort((a, b) => a - b);
  expect(times.length).toEqual(4);
  return times.slice(2).map((time, index) => time - times[index + 1]);
}

describe('the schedulers time an event with no category by its override', () => {
  it.each([
    [false, [90, 90]],
    [true, [75, 75]],
  ])('scheduleMatchUps, override %s', (overridden, expected) => {
    scenario();
    if (overridden) override('plain');
    const result: any = tournamentEngine.scheduleMatchUps({
      matchUpIds: roundOneMatchUpIds('plainDraw'),
      scheduleDate: DATE,
      periodLength: 15,
    });
    expect(result.success).toEqual(true);
    expect(scheduledGaps('plainDraw')).toEqual(expected);
  });

  it.each([
    [false, [90, 90]],
    [true, [75, 75]],
  ])('scheduleProfileRounds, override %s', (overridden, expected) => {
    scenario();
    if (overridden) override('plain');
    const { tournamentId } = tournamentEngine.getTournament().tournamentRecord;
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: 'plainDraw' });
    const structureId = drawDefinition.structures[0].structureId;
    let result: any = tournamentEngine.addSchedulingProfileRound({
      round: { tournamentId, eventId: 'plain', drawId: 'plainDraw', structureId, roundNumber: 1 },
      scheduleDate: DATE,
      venueId: 'venueId',
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.scheduleProfileRounds({ scheduleDates: [DATE], periodLength: 15 });
    expect(result.success).toEqual(true);
    expect(scheduledGaps('plainDraw')).toEqual(expected);
  });
});
