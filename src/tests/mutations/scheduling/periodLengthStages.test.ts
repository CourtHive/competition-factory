import { timeStringMinutes } from '@Tools/dateTime';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants and types
import { POLICY_SCHEDULING_DEFAULT } from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';

/**
 * Sanity of the timed pipeline when the period length changes during a run (scheduling-pipeline.md § 4, step 2):
 * rounds of one venue stating different periods are planned in stages, each on its own Garman grid, handing over in
 * profile order. Every fixture: one venue opening at 08:00, draws of 16 with unique participants (so no recovery or
 * daily limit couples the draws unless a test says so), the default scheduling policy (a standard best-of-3 averages 90
 * minutes and recovers 60).
 */
const VENUE = 'venue-1';
const DAY_1 = '2026-03-02';
const DAY_2 = '2026-03-03';
const OPENING = 8 * 60;
const STANDARD_MINUTES = 90;

type RoundSpec = { draw: number; roundNumber: number; periodLength?: number; scheduleDate?: string };
type Placement = { matchUpId: string; draw: number; roundNumber: number; date: string; minutes: number };

type BuildArgs = {
  courtsCount?: number;
  drawCount?: number;
  /** every matchUp averages 20 minutes and recovers 10 */
  shortTimes?: boolean;
  defaultPeriodLength?: number;
};

function schedulingPolicy(defaultPeriodLength?: number) {
  return { [POLICY_TYPE_SCHEDULING]: { ...POLICY_SCHEDULING_DEFAULT[POLICY_TYPE_SCHEDULING], defaultPeriodLength } };
}
const SHORT_TIMES_POLICY = {
  [POLICY_TYPE_SCHEDULING]: {
    ...POLICY_SCHEDULING_DEFAULT[POLICY_TYPE_SCHEDULING],
    defaultTimes: {
      ...POLICY_SCHEDULING_DEFAULT[POLICY_TYPE_SCHEDULING].defaultTimes,
      averageTimes: [{ categoryNames: [], minutes: { default: 20 } }],
      recoveryTimes: [{ minutes: { default: 10 } }],
    },
    matchUpAverageTimes: [],
    matchUpRecoveryTimes: [],
  },
};

/** a tournament record, built once and then loaded afresh for every run */
function build({ courtsCount = 4, drawCount = 3, shortTimes, defaultPeriodLength }: BuildArgs = {}) {
  const policyDefinitions =
    (shortTimes && SHORT_TIMES_POLICY) || (defaultPeriodLength && schedulingPolicy(defaultPeriodLength));
  const result: any = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ venueId: VENUE, courtsCount, startTime: '08:00', endTime: '23:00' }],
    drawProfiles: Array.from({ length: drawCount }, (_, index) => ({
      drawId: `draw-${index}`,
      eventId: `event-${index}`,
      uniqueParticipants: true,
      drawSize: 16,
    })),
    ...(policyDefinitions ? { policyDefinitions } : {}),
    startDate: DAY_1,
    endDate: DAY_2,
  });
  expect(result.success).toEqual(true);
  return result.tournamentRecord;
}

function profile(rounds: RoundSpec[]) {
  const { tournamentRecord } = tournamentEngine.getTournament();
  for (const { draw, roundNumber, periodLength, scheduleDate = DAY_1 } of rounds) {
    const drawId = `draw-${draw}`;
    const event = tournamentRecord.events.find((candidate: any) => candidate.drawDefinitions?.[0]?.drawId === drawId);
    const result: any = tournamentEngine.addSchedulingProfileRound({
      round: {
        structureId: event.drawDefinitions[0].structures[0].structureId,
        tournamentId: tournamentRecord.tournamentId,
        eventId: event.eventId,
        roundNumber,
        periodLength,
        drawId,
      },
      venueId: VENUE,
      scheduleDate,
    });
    expect(result.success).toEqual(true);
  }
}

/** load the record, profile the rounds and schedule them; `viaQueue` runs the same call through executionQueue */
function run(
  record: any,
  rounds: RoundSpec[],
  { periodLength, viaQueue, setup }: { periodLength?: number; viaQueue?: boolean; setup?: () => void } = {},
) {
  tournamentEngine.setState(makeDeepCopy(record, false, true));
  setup?.();
  profile(rounds);
  const params = periodLength === undefined ? {} : { periodLength };
  let result: any = viaQueue
    ? tournamentEngine.executionQueue([{ method: 'scheduleProfileRounds', params }])
    : tournamentEngine.scheduleProfileRounds(params);
  expect(result.success).toEqual(true);
  result = tournamentEngine.allTournamentMatchUps({ inContext: true });
  const placements: Placement[] = result.matchUps
    .filter((matchUp: any) => matchUp.schedule?.scheduledTime)
    .map((matchUp: any) => ({
      draw: Number(matchUp.drawId.split('-')[1]),
      minutes: timeStringMinutes(matchUp.schedule.scheduledTime),
      date: matchUp.schedule.scheduledDate,
      roundNumber: matchUp.roundNumber,
      matchUpId: matchUp.matchUpId,
    }));
  const profiledIds = result.matchUps
    .filter((matchUp: any) =>
      rounds.some(({ draw, roundNumber }) => matchUp.drawId === `draw-${draw}` && matchUp.roundNumber === roundNumber),
    )
    .map((matchUp: any) => matchUp.matchUpId);
  return { placements, profiledIds };
}

const of = (placements: Placement[], draw: number, roundNumber = 1) =>
  placements.filter((placement) => placement.draw === draw && placement.roundNumber === roundNumber);
const starts = (placements: Placement[]) => placements.map(({ minutes }) => minutes);
const onGrid = (placements: Placement[], periodLength: number) =>
  placements.every(({ minutes }) => (minutes - OPENING) % periodLength === 0);
/** the most matchUps running at once, each for its average minutes from its start */
function peakConcurrency(placements: Placement[], averageMinutes = STANDARD_MINUTES) {
  return Math.max(
    0,
    ...placements.map(
      ({ minutes, date }) =>
        placements.filter(
          (other) => other.date === date && other.minutes <= minutes && minutes < other.minutes + averageMinutes,
        ).length,
    ),
  );
}
/** how many matchUps have started by each start time: the projection a grid makes */
function startedBy(placements: Placement[]) {
  const times = [...new Set(starts(placements))].sort((a, b) => a - b);
  return times.map((time) => [time, placements.filter(({ minutes }) => minutes <= time).length]);
}
/** Garman's projection (scheduling-pipeline.md § 4, step 2): matchUps expected started by each start time */
function garmanProjection(placements: Placement[], { periodLength, courts, averageMinutes }) {
  const times = [...new Set(starts(placements))].sort((a, b) => a - b);
  return times.map((time) => {
    const period = (time - OPENING) / periodLength;
    const projected =
      period <= 1 ? courts : Math.round(((periodLength * courts) / averageMinutes) * (period - 1) + courts);
    return [time, Math.min(placements.length, projected)];
  });
}
const sortedPlacements = (placements: Placement[]) =>
  placements.toSorted((a, b) => a.matchUpId.localeCompare(b.matchUpId));

/** the invariants every staged run must keep */
function expectEveryMatchUpPlacedOnce({ placements, profiledIds }: ReturnType<typeof run>) {
  const ids = placements.map(({ matchUpId }) => matchUpId);
  expect(new Set(ids).size).toEqual(ids.length);
  expect(ids.toSorted((a, b) => a.localeCompare(b))).toEqual(
    profiledIds.toSorted((a: string, b: string) => a.localeCompare(b)),
  );
}
function expectHandOver(earlier: Placement[], later: Placement[]) {
  expect(earlier.length).toBeGreaterThan(0);
  expect(later.length).toBeGreaterThan(0);
  expect(Math.min(...starts(later))).toBeGreaterThanOrEqual(Math.max(...starts(earlier)));
}

describe('period length changing between rounds of one venue: one day, four courts', () => {
  const record = build();

  it('30 then 15: every matchUp placed once, each start on its own round grid, round B starts no earlier than round A hands over, concurrency within the single-period Garman peak', () => {
    const staged = run(record, [
      { draw: 0, roundNumber: 1, periodLength: 30 },
      { draw: 1, roundNumber: 1, periodLength: 15 },
    ]);
    expectEveryMatchUpPlacedOnce(staged);
    const [roundA, roundB] = [of(staged.placements, 0), of(staged.placements, 1)];
    expect(onGrid(roundA, 30)).toEqual(true);
    expect(onGrid(roundB, 15)).toEqual(true);
    expectHandOver(roundA, roundB);

    // the same profile with one period throughout, as the call's: the peaks Garman allows with either grid
    const at30 = run(
      record,
      [
        { draw: 0, roundNumber: 1 },
        { draw: 1, roundNumber: 1 },
      ],
      { periodLength: 30 },
    );
    const at15 = run(
      record,
      [
        { draw: 0, roundNumber: 1 },
        { draw: 1, roundNumber: 1 },
      ],
      { periodLength: 15 },
    );
    const allowed = Math.max(peakConcurrency(at30.placements), peakConcurrency(at15.placements));
    expect(peakConcurrency(staged.placements)).toBeLessThanOrEqual(allowed);

    // round A is the 30-minute grid's own: placed exactly where a single 30-minute run places it
    expect(starts(roundA)).toEqual(starts(of(at30.placements, 0)));
    // Garman 4 courts, 90 minutes, L=30: 4, 4, 5, 7, 8 by 08:00, 08:30, 09:00, 09:30, 10:00
    expect(startedBy(roundA)).toEqual([
      [480, 4],
      [540, 5],
      [570, 7],
      [600, 8],
    ]);
    // round B continues Garman's cumulative count on the 15-minute grid: 9 started by 10:00 (TM at L=15 is 8.67)
    expect(startedBy(roundB)).toEqual([
      [600, 1],
      [630, 2],
      [645, 3],
      [675, 4],
      [690, 5],
      [720, 6],
      [735, 7],
      [765, 8],
    ]);
    // it really is the finer grid: some of its starts are off the 30-minute one
    expect(onGrid(roundB, 30)).toEqual(false);
  });

  it('15 then 30 (the reverse): every matchUp placed once, each start on its own round grid, round B starts no earlier than round A hands over, concurrency within the single-period Garman peak', () => {
    const staged = run(record, [
      { draw: 0, roundNumber: 1, periodLength: 15 },
      { draw: 1, roundNumber: 1, periodLength: 30 },
    ]);
    expectEveryMatchUpPlacedOnce(staged);
    const [roundA, roundB] = [of(staged.placements, 0), of(staged.placements, 1)];
    expect(onGrid(roundA, 15)).toEqual(true);
    expect(onGrid(roundA, 30)).toEqual(false);
    expect(onGrid(roundB, 30)).toEqual(true);
    expectHandOver(roundA, roundB);
    // round A's last start is 09:45; the 30-minute grid projects 8 by 10:00 and 9 by 10:30, so round B's first start
    // is 10:30: a coarser grid after a finer one can leave up to one coarse period with no start at the hand-over
    expect(Math.max(...starts(roundA))).toEqual(585);
    expect(Math.min(...starts(roundB))).toEqual(630);

    const both = [
      { draw: 0, roundNumber: 1 },
      { draw: 1, roundNumber: 1 },
    ];
    const allowed = Math.max(
      peakConcurrency(run(record, both, { periodLength: 30 }).placements),
      peakConcurrency(run(record, both, { periodLength: 15 }).placements),
    );
    expect(peakConcurrency(staged.placements)).toBeLessThanOrEqual(allowed);
  });

  it('30, 60, 30: every matchUp placed once, each start on its own round grid, each round starts no earlier than the one before hands over (profile order kept), concurrency within the single-period Garman peak', () => {
    const rounds = [
      { draw: 0, roundNumber: 1, periodLength: 30 },
      { draw: 1, roundNumber: 1, periodLength: 60 },
      { draw: 2, roundNumber: 1, periodLength: 30 },
    ];
    const staged = run(record, rounds);
    expectEveryMatchUpPlacedOnce(staged);
    const [first, middle, last] = [0, 1, 2].map((draw) => of(staged.placements, draw));
    expect(onGrid(first, 30)).toEqual(true);
    expect(onGrid(middle, 60)).toEqual(true);
    expect(onGrid(last, 30)).toEqual(true);
    expectHandOver(first, middle);
    expectHandOver(middle, last);
    // the 60-minute grid projects 7 by 10:00 (fewer than the 8 already started) and 9 by 11:00: the middle round
    // starts at 11:00, an hour after the hand-over, then 4, 7 and 8 started by 12:00, 13:00 and 14:00
    expect(startedBy(middle)).toEqual([
      [660, 1],
      [720, 4],
      [780, 7],
      [840, 8],
    ]);

    const plain = rounds.map(({ draw, roundNumber }) => ({ draw, roundNumber }));
    const allowed = Math.max(
      peakConcurrency(run(record, plain, { periodLength: 30 }).placements),
      peakConcurrency(run(record, plain, { periodLength: 60 }).placements),
    );
    expect(peakConcurrency(staged.placements)).toBeLessThanOrEqual(allowed);
  });

  it('consecutive rounds stating the same period form one stage: placed exactly as one run at that period', () => {
    const staged = run(record, [
      { draw: 0, roundNumber: 1, periodLength: 15 },
      { draw: 1, roundNumber: 1, periodLength: 15 },
    ]);
    const single = run(
      record,
      [
        { draw: 0, roundNumber: 1 },
        { draw: 1, roundNumber: 1 },
      ],
      { periodLength: 15 },
    );
    expect(sortedPlacements(staged.placements)).toEqual(sortedPlacements(single.placements));
  });

  it('a round with no stated period after one with a period takes the derived period (30 for 90-minute matchUps), handing over in profile order', () => {
    const staged = run(record, [
      { draw: 0, roundNumber: 1, periodLength: 45 },
      { draw: 1, roundNumber: 1 },
    ]);
    expectEveryMatchUpPlacedOnce(staged);
    const [roundA, roundB] = [of(staged.placements, 0), of(staged.placements, 1)];
    expect(onGrid(roundA, 45)).toEqual(true);
    expect(onGrid(roundB, 30)).toEqual(true);
    expectHandOver(roundA, roundB);
  });

  it('a dependent round (R2 after R1 of the same draw) at a different period: R2 starts after its R1 sources and on its own grid', () => {
    const staged = run(record, [
      { draw: 0, roundNumber: 1, periodLength: 30 },
      { draw: 0, roundNumber: 2, periodLength: 15 },
    ]);
    expectEveryMatchUpPlacedOnce(staged);
    const [first, second] = [of(staged.placements, 0, 1), of(staged.placements, 0, 2)];
    expect(onGrid(first, 30)).toEqual(true);
    expect(onGrid(second, 15)).toEqual(true);
    expectHandOver(first, second);
    // each R2 matchUp waits for its sources' average and recovery (90 + 60)
    expect(Math.min(...starts(second))).toBeGreaterThanOrEqual(Math.min(...starts(first)) + 150);
  });
});

describe('a round period against its format: longer and shorter than average plus recovery', () => {
  it('a period (45) longer than average plus recovery (20 + 10): starts on the 45 grid, each period starting the matchUps Garman projects for it, several at once on one court (start times are not-before times)', () => {
    const record = build({ drawCount: 1, shortTimes: true });
    const staged = run(record, [{ draw: 0, roundNumber: 1, periodLength: 45 }]);
    expectEveryMatchUpPlacedOnce(staged);
    expect(onGrid(staged.placements, 45)).toEqual(true);
    // TM = ((45 × 4) / 20) × (P − 1) + 4: 4 at the opening, none at period 1, the other 4 at period 2 (09:30)
    expect(startedBy(staged.placements)).toEqual([
      [480, 4],
      [570, 8],
    ]);
    expect(startedBy(staged.placements)).toEqual(
      garmanProjection(staged.placements, { periodLength: 45, courts: 4, averageMinutes: 20 }),
    );
    // the same period stated as the call's: identical
    const viaCall = run(record, [{ draw: 0, roundNumber: 1 }], { periodLength: 45 });
    expect(sortedPlacements(viaCall.placements)).toEqual(sortedPlacements(staged.placements));
  });

  it('a period (15) shorter than average plus recovery (90 + 60): starts on the 15 grid, each start time carrying exactly the count Garman projects (up to 7 started on 4 courts before the first ends, by design)', () => {
    const record = build({ drawCount: 2 });
    const staged = run(record, [
      { draw: 0, roundNumber: 1, periodLength: 15 },
      { draw: 1, roundNumber: 1, periodLength: 15 },
    ]);
    expectEveryMatchUpPlacedOnce(staged);
    expect(onGrid(staged.placements, 15)).toEqual(true);
    expect(startedBy(staged.placements)).toEqual(
      garmanProjection(staged.placements, { periodLength: 15, courts: 4, averageMinutes: STANDARD_MINUTES }),
    );
    expect(peakConcurrency(staged.placements)).toEqual(7);
  });
});

describe('multi-day profiles', () => {
  it('day 1 at 30 and day 2 at 15: every matchUp placed once on its own day, each day on its own grid from that day opening', () => {
    const record = build({ drawCount: 2 });
    const staged = run(record, [
      { draw: 0, roundNumber: 1, periodLength: 30, scheduleDate: DAY_1 },
      { draw: 0, roundNumber: 2, periodLength: 30, scheduleDate: DAY_1 },
      { draw: 1, roundNumber: 1, periodLength: 15, scheduleDate: DAY_2 },
      { draw: 1, roundNumber: 2, periodLength: 15, scheduleDate: DAY_2 },
    ]);
    expectEveryMatchUpPlacedOnce(staged);
    const day1 = staged.placements.filter(({ date }) => date === DAY_1);
    const day2 = staged.placements.filter(({ date }) => date === DAY_2);
    expect(day1.every(({ draw }) => draw === 0)).toEqual(true);
    expect(day2.every(({ draw }) => draw === 1)).toEqual(true);
    expect(onGrid(day1, 30)).toEqual(true);
    expect(onGrid(day2, 15)).toEqual(true);
    expect(Math.min(...starts(day2))).toEqual(OPENING);
    expectHandOver(of(day2, 1, 1), of(day2, 1, 2));
  });

  it('day 2 changing period between its rounds while day 1 keeps one: day 1 placed exactly as a single-period run', () => {
    const record = build({ drawCount: 3 });
    const staged = run(record, [
      { draw: 0, roundNumber: 1, periodLength: 30, scheduleDate: DAY_1 },
      { draw: 1, roundNumber: 1, periodLength: 30, scheduleDate: DAY_2 },
      { draw: 2, roundNumber: 1, periodLength: 15, scheduleDate: DAY_2 },
    ]);
    expectEveryMatchUpPlacedOnce(staged);
    const day1 = staged.placements.filter(({ date }) => date === DAY_1);
    const single = run(record, [{ draw: 0, roundNumber: 1, scheduleDate: DAY_1 }], { periodLength: 30 });
    expect(sortedPlacements(day1)).toEqual(sortedPlacements(single.placements));
    const day2 = staged.placements.filter(({ date }) => date === DAY_2);
    expect(onGrid(of(day2, 1), 30)).toEqual(true);
    expect(onGrid(of(day2, 2), 15)).toEqual(true);
    expectHandOver(of(day2, 1), of(day2, 2));
  });
});

describe('precedence: the call, then the round, then the policy default, then the derived period', () => {
  const rounds = [
    { draw: 0, roundNumber: 1 },
    { draw: 1, roundNumber: 1 },
  ];

  it('the policy default alone is the period of every round: placed exactly as a run whose call states it', () => {
    const withPolicy = build({ drawCount: 2, defaultPeriodLength: 45 });
    const plain = build({ drawCount: 2 });
    const policyRun = run(withPolicy, rounds);
    expect(onGrid(policyRun.placements, 45)).toEqual(true);
    expect(starts(policyRun.placements)).toEqual(starts(run(plain, rounds, { periodLength: 45 }).placements));
    // and differs from the derived period (30) a record with no default takes
    expect(starts(policyRun.placements)).not.toEqual(starts(run(plain, rounds).placements));
  });

  it('a round own period beats the policy default; a round without one takes the default', () => {
    const withPolicy = build({ drawCount: 2, defaultPeriodLength: 45 });
    const staged = run(withPolicy, [
      { draw: 0, roundNumber: 1 },
      { draw: 1, roundNumber: 1, periodLength: 15 },
    ]);
    expectEveryMatchUpPlacedOnce(staged);
    expect(onGrid(of(staged.placements, 0), 45)).toEqual(true);
    expect(onGrid(of(staged.placements, 1), 15)).toEqual(true);
    expectHandOver(of(staged.placements, 0), of(staged.placements, 1));
  });

  it('the call period beats both the round own period and the policy default: placed exactly as a run with nothing stated but the call', () => {
    const withPolicy = build({ drawCount: 2, defaultPeriodLength: 45 });
    const plain = build({ drawCount: 2 });
    const overridden = run(
      withPolicy,
      [
        { draw: 0, roundNumber: 1, periodLength: 60 },
        { draw: 1, roundNumber: 1, periodLength: 15 },
      ],
      { periodLength: 20 },
    );
    const callOnly = run(plain, rounds, { periodLength: 20 });
    expect(starts(overridden.placements)).toEqual(starts(callOnly.placements));
    expect(onGrid(overridden.placements, 20)).toEqual(true);
  });

  it('an event policy default beats the tournament policy default for that event round', () => {
    const withPolicy = build({ drawCount: 2, defaultPeriodLength: 45 });
    const staged = run(withPolicy, rounds, {
      setup: () => {
        const result: any = tournamentEngine.attachPolicies({
          eventId: 'event-1',
          policyDefinitions: schedulingPolicy(15),
        });
        expect(result.success).toEqual(true);
      },
    });
    expectEveryMatchUpPlacedOnce(staged);
    expect(onGrid(of(staged.placements, 0), 45)).toEqual(true);
    expect(onGrid(of(staged.placements, 1), 15)).toEqual(true);
  });

  it('a draw policy default beats the event policy default for that draw round', () => {
    const plain = build({ drawCount: 2 });
    const staged = run(plain, rounds, {
      setup: () => {
        let result: any = tournamentEngine.attachPolicies({
          eventId: 'event-1',
          policyDefinitions: schedulingPolicy(45),
        });
        expect(result.success).toEqual(true);
        result = tournamentEngine.attachPolicies({ drawId: 'draw-1', policyDefinitions: schedulingPolicy(15) });
        expect(result.success).toEqual(true);
      },
    });
    expectEveryMatchUpPlacedOnce(staged);
    // draw-0 states nothing: the derived 30; draw-1 its draw's 15 (not the event's 45, and off the 30 grid)
    expect(onGrid(of(staged.placements, 0), 30)).toEqual(true);
    expect(onGrid(of(staged.placements, 1), 15)).toEqual(true);
    expect(onGrid(of(staged.placements, 1), 30)).toEqual(false);
  });

  it('a policy default that is not a positive number is ignored: placed exactly as a record with no default', () => {
    const plain = build({ drawCount: 2 });
    const invalid = build({ drawCount: 2 });
    const ignored = run(invalid, rounds, {
      setup: () => {
        const result: any = tournamentEngine.attachPolicies({ policyDefinitions: schedulingPolicy(-5) });
        expect(result.success).toEqual(true);
      },
    });
    expect(starts(ignored.placements)).toEqual(starts(run(plain, rounds).placements));
  });
});

describe('determinism', () => {
  const record = build();
  const rounds = [
    { draw: 0, roundNumber: 1, periodLength: 30 },
    { draw: 1, roundNumber: 1, periodLength: 15 },
    { draw: 2, roundNumber: 1, periodLength: 60 },
  ];

  it('the same inputs twice give identical schedules', () => {
    const first = run(record, rounds);
    const second = run(record, rounds);
    expect(sortedPlacements(second.placements)).toEqual(sortedPlacements(first.placements));
  });

  it('the same schedule through executionQueue as through a direct call', () => {
    const direct = run(record, rounds);
    const queued = run(record, rounds, { viaQueue: true });
    expect(sortedPlacements(queued.placements)).toEqual(sortedPlacements(direct.placements));
  });
});

describe('scheduleMatchUps and the policy default', () => {
  function scheduleListed(record: any, params: Record<string, unknown> = {}, setup?: () => void) {
    tournamentEngine.setState(makeDeepCopy(record, false, true));
    setup?.();
    const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
    const matchUpIds = matchUps.map(({ matchUpId }: any) => matchUpId);
    const result: any = tournamentEngine.scheduleMatchUps({ scheduleDate: DAY_1, matchUpIds, ...params });
    expect(result.success).toEqual(true);
    expect(result.scheduledMatchUpIds.length).toEqual(matchUpIds.length);
    const timed = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
    return timed.map(({ schedule }: any) => schedule?.scheduledTime);
  }

  it('the policy default is the period when the call states none: placed exactly as a call stating it; the call period beats it', () => {
    const plain = build({ drawCount: 2 });
    const withPolicy = build({ drawCount: 2, defaultPeriodLength: 45 });
    const policyTimes = scheduleListed(withPolicy);
    expect(policyTimes).toEqual(scheduleListed(plain, { periodLength: 45 }));
    expect(policyTimes).not.toEqual(scheduleListed(plain));
    expect(scheduleListed(withPolicy, { periodLength: 30 })).toEqual(scheduleListed(plain));
  });
});

describe('calculateScheduleTimes and the policy default', () => {
  function slots(record: any, params: Record<string, unknown> = {}) {
    tournamentEngine.setState(makeDeepCopy(record, false, true));
    const result: any = tournamentEngine.calculateScheduleTimes({ scheduleDate: DAY_1, ...params });
    expect(result.scheduleTimes.length).toBeGreaterThan(0);
    return result.scheduleTimes.map(({ scheduleTime }: any) => scheduleTime);
  }

  it('the tournament policy default is the period when the call states none; the call period beats it', () => {
    const plain = build({ drawCount: 1 });
    const withPolicy = build({ drawCount: 1, defaultPeriodLength: 45 });
    expect(slots(withPolicy)).toEqual(slots(plain, { periodLength: 45 }));
    expect(slots(withPolicy)).not.toEqual(slots(plain));
    expect(slots(withPolicy, { periodLength: 30 })).toEqual(slots(plain, { periodLength: 30 }));
  });
});
