import { addMinutesToTimeString, extractTime } from '@Tools/dateTime';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { SINGLES_EVENT, TEAM } from '@Constants/eventConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';

/**
 * `modifyEventMatchUpFormatTiming` keys a TEAM event's override by the event's type (`minutes: { TEAM: n }`), while
 * the collection matchUps it times are SINGLES or DOUBLES. A reader asking for the line's own type found no minutes:
 * the override was reported by `getEventMatchUpFormatTiming`, but line timing and hydration fell back to defaults.
 */

const startDate = '2023-06-26';
const OVERRIDE = 75;

function teamEventTournament({ minutes }: { minutes?: number } = {}) {
  const {
    tournamentRecord,
    venueIds: [venueId],
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: DOMINANT_DUO }],
    venueProfiles: [{ courtsCount: 1 }],
    endDate: startDate,
    startDate,
  });
  tournamentEngine.setState(tournamentRecord);

  const { event } = tournamentEngine.getEvent({ eventId });
  const tieFormat = event.tieFormat ?? event.drawDefinitions[0].tieFormat;
  const formats: Record<string, string> = Object.fromEntries(
    tieFormat.collectionDefinitions.map(({ matchUpType, matchUpFormat }) => [matchUpType, matchUpFormat]),
  );

  if (minutes) {
    for (const matchUpFormat of Object.values(formats)) {
      let result: any = tournamentEngine.modifyEventMatchUpFormatTiming({
        averageMinutes: minutes,
        matchUpFormat,
        eventId,
      });
      expect(result.success).toEqual(true);
    }
  }

  return { venueId, eventId, formats };
}

function lineMatchUps(params: any = {}) {
  return tournamentEngine.allCompetitionMatchUps({
    matchUpFilters: { matchUpTypes: [SINGLES, DOUBLES] },
    ...params,
  }).matchUps;
}

function earliestTimes(matchUps: any[]) {
  return matchUps.map(({ schedule }) => extractTime(schedule.scheduledTime) ?? '').sort();
}

describe('a TEAM event matchUpFormat timing override', () => {
  it('is read for the SINGLES and DOUBLES lines of the event', () => {
    const { eventId, formats } = teamEventTournament({ minutes: OVERRIDE });

    for (const [matchUpType, matchUpFormat] of Object.entries(formats)) {
      let result: any = tournamentEngine.getMatchUpFormatTiming({ eventType: matchUpType, matchUpFormat, eventId });
      expect(result.averageMinutes).toEqual(OVERRIDE);

      // the event's own type reads it too, as it always did
      result = tournamentEngine.getMatchUpFormatTiming({ eventType: TEAM, matchUpFormat, eventId });
      expect(result.averageMinutes).toEqual(OVERRIDE);
    }

    // and the event reports it
    const { eventMatchUpFormatTiming } = tournamentEngine.getEventMatchUpFormatTiming({ eventId });
    for (const matchUpFormat of Object.values(formats)) {
      const timing = eventMatchUpFormatTiming.find((t) => t.matchUpFormat === matchUpFormat);
      expect(timing?.averageMinutes).toEqual(OVERRIDE);
    }
  });

  it('spaces the lines the profile scheduler places, and hydrates their timeAfterRecovery from it', () => {
    const { venueId, eventId, formats } = teamEventTournament({ minutes: OVERRIDE });

    const { rounds } = tournamentEngine.getRounds();
    let result: any = tournamentEngine.setSchedulingProfile({
      schedulingProfile: [{ scheduleDate: startDate, venues: [{ venueId, rounds }] }],
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.scheduleProfileRounds();
    expect(result.success).toEqual(true);

    const matchUps = lineMatchUps({ afterRecoveryTimes: true });
    expect(matchUps.length).toEqual(3);
    const [first, ...rest] = earliestTimes(matchUps);
    // one court: nothing else starts before the first line's override minutes have passed
    const firstEnds = addMinutesToTimeString(first, OVERRIDE);
    expect(rest.every((time) => time >= firstEnds)).toEqual(true);

    for (const matchUp of matchUps) {
      const scheduledTime = extractTime(matchUp.schedule.scheduledTime);
      const { recoveryMinutes } = tournamentEngine.getMatchUpFormatTiming({
        matchUpFormat: formats[matchUp.matchUpType],
        eventType: matchUp.matchUpType,
        eventId,
      });
      expect(matchUp.schedule.timeAfterRecovery).toEqual(
        addMinutesToTimeString(scheduledTime, OVERRIDE + recoveryMinutes),
      );
    }
  });

  it('spaces the lines scheduleMatchUps places', () => {
    const { venueId } = teamEventTournament({ minutes: OVERRIDE });

    const matchUpIds = lineMatchUps().map(({ matchUpId }) => matchUpId);
    let result: any = tournamentEngine.scheduleMatchUps({ scheduleDate: startDate, venueIds: [venueId], matchUpIds });
    expect(result.success).toEqual(true);

    const [first, ...rest] = earliestTimes(lineMatchUps());
    expect(rest.length).toEqual(2);
    const firstEnds = addMinutesToTimeString(first, OVERRIDE);
    expect(rest.every((time) => time >= firstEnds)).toEqual(true);
  });

  it('without an override the lines read the policy minutes', () => {
    const { eventId, formats } = teamEventTournament();
    for (const [matchUpType, matchUpFormat] of Object.entries(formats)) {
      let result: any = tournamentEngine.getMatchUpFormatTiming({ eventType: matchUpType, matchUpFormat, eventId });
      expect(result.averageMinutes).toBeGreaterThan(0);
      expect(result.averageMinutes).not.toEqual(OVERRIDE);
    }
  });
});

it('a SINGLES event override stays keyed by SINGLES: the TEAM fallback does not apply', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4, eventType: SINGLES_EVENT }],
    startDate,
  });
  tournamentEngine.setState(tournamentRecord);
  const matchUpFormat = lineMatchUps()[0].matchUpFormat;

  let result: any = tournamentEngine.getMatchUpFormatTiming({ eventType: TEAM, matchUpFormat, eventId });
  const teamBefore = result.averageMinutes;

  result = tournamentEngine.modifyEventMatchUpFormatTiming({ averageMinutes: OVERRIDE, matchUpFormat, eventId });
  expect(result.success).toEqual(true);

  result = tournamentEngine.getMatchUpFormatTiming({ eventType: SINGLES, matchUpFormat, eventId });
  expect(result.averageMinutes).toEqual(OVERRIDE);

  const { event } = tournamentEngine.getEvent({ eventId });
  const stored = event.extensions.find(({ name }) => name === 'scheduleTiming').value;
  expect(JSON.stringify(stored)).toContain(`"SINGLES":${OVERRIDE}`);
  expect(JSON.stringify(stored)).not.toContain('"TEAM"');

  // a TEAM-typed read of a SINGLES event's timing is not rerouted to the SINGLES key either
  result = tournamentEngine.getMatchUpFormatTiming({ eventType: TEAM, matchUpFormat, eventId });
  expect(result.averageMinutes === OVERRIDE).toEqual(teamBefore === OVERRIDE);
});
