import { getParticipantId } from '@Functions/global/extractors';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { AUTO_SCHEDULING_AUDIT } from '@Constants/auditConstants';
import { DO_NOT_SCHEDULE } from '@Constants/requestConstants';

/**
 * A profile run reports the person requests its placements broke under the date they were broken on:
 * `requestConflicts[date]` holds `{ request, scheduleTimes, matchUpIds }` per request, and nothing else is a key. The
 * auto-scheduling audit counts them. Each request has its own id, so requests added in one call stay apart.
 */
const DAYS = ['2026-03-02', '2026-03-03'];
const VENUE = 'venue-1';

/** an 8 draw on one court; round 1 profiled on day 1 and round 2 on day 2, both from 10:00 */
function twoDayFixture() {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ venueId: VENUE, courtsCount: 1, startTime: '10:00', endTime: '20:00' }],
    drawProfiles: [{ drawSize: 8 }],
    startDate: DAYS[0],
    endDate: DAYS[1],
    setState: true,
  });
  const { tournamentRecord } = tournamentEngine.getTournament();
  const [event] = tournamentRecord.events;
  const [drawDefinition] = event.drawDefinitions;
  for (const [roundNumber, scheduleDate] of [
    [1, DAYS[0]],
    [2, DAYS[1]],
  ] as const) {
    const result: any = tournamentEngine.addSchedulingProfileRound({
      round: {
        structureId: drawDefinition.structures[0].structureId,
        tournamentId: tournamentRecord.tournamentId,
        drawId: drawDefinition.drawId,
        eventId: event.eventId,
        roundNumber,
      },
      venueId: VENUE,
      scheduleDate,
    });
    expect(result.success).toEqual(true);
  }
  const [firstMatchUp] = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
  return { personId: firstMatchUp.sides[0].participant.person.personId, firstMatchUp };
}

/** one call adds a 10:00 to 11:30 request on each day: a placement at 10:00 on either day breaks it */
function addRequestsOnBothDays(personId: string) {
  const result: any = tournamentEngine.addPersonRequests({
    requests: DAYS.map((date) => ({ date, startTime: '10:00', endTime: '11:30', requestType: DO_NOT_SCHEDULE })),
    personId,
  });
  expect(result.success).toEqual(true);
  return tournamentEngine.getPersonRequests({ requestType: DO_NOT_SCHEDULE }).personRequests[personId];
}

describe('request conflicts are reported under their date', () => {
  it('requests added in one call each have their own id', () => {
    const { personId } = twoDayFixture();
    const requests = addRequestsOnBothDays(personId);
    expect(requests.map(({ date }) => date)).toEqual(DAYS);
    expect(new Set(requests.map(({ requestId }) => requestId)).size).toEqual(2);
  });

  it('removing one request by its id leaves the other', () => {
    const { personId } = twoDayFixture();
    const [first, second] = addRequestsOnBothDays(personId);
    const result: any = tournamentEngine.removePersonRequests({ personId, requestId: first.requestId });
    expect(result.success).toEqual(true);
    const remaining = tournamentEngine.getPersonRequests({ requestType: DO_NOT_SCHEDULE }).personRequests[personId];
    expect(remaining.map(({ requestId }) => requestId)).toEqual([second.requestId]);
  });

  it('a two-day run keys conflicts by date only, each under the date of its request, and the audit counts them', () => {
    const { personId, firstMatchUp } = twoDayFixture();
    const requests = addRequestsOnBothDays(personId);
    const result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: DAYS });
    expect(result.success).toEqual(true);

    const { requestConflicts } = result;
    expect(Object.keys(requestConflicts).toSorted((a, b) => a.localeCompare(b))).toEqual(DAYS);
    for (const [index, date] of DAYS.entries()) {
      const conflicts = requestConflicts[date];
      expect(conflicts.length).toEqual(1);
      const [{ request, scheduleTimes, matchUpIds }] = conflicts;
      expect(request).toMatchObject({ requestId: requests[index].requestId, date, personId });
      expect(scheduleTimes).toContain('10:00');
      expect(matchUpIds.length).toBeGreaterThan(0);
    }
    // on day 1 the request is broken by the matchUp its person is placed in
    expect(requestConflicts[DAYS[0]][0].matchUpIds).toContain(firstMatchUp.matchUpId);

    // the audit counts the conflicts, one per request per date
    const { tournamentRecord } = tournamentEngine.getTournament();
    const audit = tournamentRecord.timeItems.find(({ itemType }: any) => itemType === AUTO_SCHEDULING_AUDIT);
    expect(audit.itemValue.requestConflictsCount).toEqual(2);
  });

  it('a person with no requests reports an empty list per date', () => {
    twoDayFixture();
    const participantIds = tournamentEngine.getParticipants().participants.map(getParticipantId);
    expect(participantIds.length).toBeGreaterThan(0);
    const result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: DAYS });
    expect(result.requestConflicts).toEqual({ [DAYS[0]]: [], [DAYS[1]]: [] });
  });
});
