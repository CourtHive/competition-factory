import { decodePlanningView, encodePlanningView } from '@Mutate/matchUps/schedule/pipeline/viewCodec';
import { checkViewRoundTrip } from '../../../testHarness/scheduling/viewRoundTrip';
import { buildSchedulingView } from '@Mutate/matchUps/schedule/pipeline/view';
import { planSchedule } from '@Mutate/matchUps/schedule/pipeline/plan';
import { DAYS, playedLaterFixture } from './playedOrderFixture';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

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
});
