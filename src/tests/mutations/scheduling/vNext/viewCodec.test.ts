import { decodePlanningView, encodePlanningView } from '@Mutate/matchUps/schedule/pipeline/viewCodec';
import { checkViewRoundTrip } from '../../../testHarness/scheduling/viewRoundTrip';
import { buildSchedulingView } from '@Mutate/matchUps/schedule/pipeline/view';
import { planSchedule } from '@Mutate/matchUps/schedule/pipeline/plan';
import { DAYS, playedLaterFixture } from './playedOrderFixture';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { DO_NOT_SCHEDULE } from '@Constants/requestConstants';

/**
 * The profile scheduler's planner reads only its view: a plan from the view equals the plan from the view written as JSON
 * and read back, the JSON carries no record, and planning leaves the view as it found it (`viewCodec.ts`).
 */
function fixtureWithBothDaysProfiled() {
  const { tournamentId, drawB } = playedLaterFixture();
  // day 2 holds draw A's played round 1: matchUps already timed on a planned date, outside the profile
  const result = tournamentEngine.addSchedulingProfileRound({
    round: { tournamentId, ...drawB, roundNumber: 2 },
    scheduleDate: DAYS[1],
    venueId: 'venue-1',
  });
  expect(result.success).toEqual(true);
  const { tournamentRecord } = tournamentEngine.getTournament();
  return { tournamentRecords: { [tournamentId]: tournamentRecord } };
}

describe('the planning view as JSON', () => {
  it('plans the same from JSON, carries no record, and is not changed by planning', () => {
    const { tournamentRecords } = fixtureWithBothDaysProfiled();
    expect(checkViewRoundTrip({ tournamentRecords })).toMatchObject({
      viewUnchanged: true,
      readsRecords: false,
      samePlan: true,
      planned: true,
    });
  });

  it('resolves everything the planner reads, and keeps the hot-path Sets', () => {
    const { tournamentRecords } = fixtureWithBothDaysProfiled();
    const view: any = buildSchedulingView({ tournamentRecords });
    const decoded = decodePlanningView(encodePlanningView(view));
    // played draws, timed matchUps on a planned date, and each planned date's courts are all in the view
    expect(Object.keys(decoded.playedOrderFacts).length).toEqual(1);
    expect(Object.keys(decoded.timedMinutes).length).toEqual(4);
    expect(Object.keys(decoded.dateCourts).toSorted()).toEqual(DAYS);
    expect(decoded.dateCourts[DAYS[0]].length).toEqual(4);
    const upstream = Object.values(decoded.reachability.upstream);
    expect(upstream.length).toBeGreaterThan(0);
    expect(upstream.every((ids) => ids instanceof Set)).toEqual(true);
    expect(Object.keys(decoded)).not.toContain('tournamentRecords');
    expect(Object.keys(decoded)).not.toContain('matchUps');
  });

  it('the comparison can fail: a view missing a day of courts plans differently', () => {
    const { tournamentRecords } = fixtureWithBothDaysProfiled();
    const view: any = buildSchedulingView({ tournamentRecords });
    const direct = planSchedule({ view });
    const tampered = decodePlanningView(encodePlanningView(view));
    tampered.dateCourts[DAYS[0]] = [];
    expect(JSON.stringify(planSchedule({ view: tampered }))).not.toEqual(JSON.stringify(direct));
  });

  it('carries the sides a person request is read from: without them a request on a placed participant is missed', () => {
    const scheduleDate = DAYS[0];
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ venueId: 'venue-1', courtsCount: 1, startTime: '10:00', endTime: '20:00' }],
      drawProfiles: [{ drawSize: 2 }],
      startDate: scheduleDate,
      endDate: DAYS[1],
      setState: true,
    });
    const { tournamentRecord } = tournamentEngine.getTournament();
    const { tournamentId } = tournamentRecord;
    const [event] = tournamentRecord.events;
    const [drawDefinition] = event.drawDefinitions;
    let result: any = tournamentEngine.addSchedulingProfileRound({
      round: {
        structureId: drawDefinition.structures[0].structureId,
        drawId: drawDefinition.drawId,
        eventId: event.eventId,
        roundNumber: 1,
        tournamentId,
      },
      venueId: 'venue-1',
      scheduleDate,
    });
    expect(result.success).toEqual(true);
    const [target] = tournamentEngine.allTournamentMatchUps().matchUps;
    result = tournamentEngine.addPersonRequests({
      requests: [{ date: scheduleDate, startTime: '10:00', endTime: '11:30', requestType: DO_NOT_SCHEDULE }],
      personId: target.sides[0].participant.person.personId,
    });
    expect(result.success).toEqual(true);

    const records = { [tournamentId]: tournamentEngine.getTournament().tournamentRecord };
    const view: any = buildSchedulingView({ tournamentRecords: records });
    const plan = planSchedule({ view });
    expect(plan.matchUpScheduleTimes[target.matchUpId]).toBeDefined();
    expect(plan.matchUpScheduleTimes[target.matchUpId]).not.toEqual('10:00');
    expect(checkViewRoundTrip({ tournamentRecords: records })).toMatchObject({ samePlan: true });

    const sideless = decodePlanningView(encodePlanningView(view));
    for (const matchUp of sideless.hydrated) delete matchUp.sides;
    expect(planSchedule({ view: sideless }).matchUpScheduleTimes[target.matchUpId]).toEqual('10:00');
  });
});
