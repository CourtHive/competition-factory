import { buildGridDateView, GridDatePlan, planGridDate } from '@Mutate/matchUps/schedule/pipeline/gridPlan';
import { gridViewData, gridViewFromData } from '@Mutate/matchUps/schedule/pipeline/gridViewCodec';
import { allCompetitionMatchUps } from '@Query/matchUps/getAllCompetitionMatchUps';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setRandomSource } from '@Tools/prng';
import { setClock } from '@Tools/clock';
import { overTheWire } from './kernel';

// constants and types
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import type { KernelCase } from './kernel';

/**
 * The authored `kernel.scheduling.grid@1` cases: one small date per rule of `scheduling-pipeline.md` § 5, each held to
 * CLAIMS derived from the spec (which row, which court, what is deferred or over a limit), so the whole plan can be
 * read and checked by hand. The case file then pins the whole plan (`KERNEL_SCHEDULING_CASES=write` rewrites it).
 *
 * Every fixture: one venue, one date, the default grid of at least 10 rows; each draw's first round placed in round
 * position order unless the source says otherwise.
 */
const DAY = '2026-03-02';
const VENUE = 'venue-1';

type BuildArgs = { matchUpDailyLimits?: { [key: string]: number }; dailyLimitsWarnOnly?: boolean; courtIds?: string[] };
type Source = {
  caseId: string;
  note: string;
  build: () => { roundNumbers: number[]; args?: BuildArgs };
  claims: (plan: GridDatePlan, ids: Labels) => void;
};
type Labels = { [label: string]: string };

function tournament({
  drawSize,
  courtsCount,
  drawProfiles,
}: {
  drawSize?: number;
  courtsCount: number;
  drawProfiles?: any[];
}) {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ venueId: VENUE, courtsCount, startTime: '10:00', endTime: '20:00' }],
    drawProfiles: drawProfiles ?? [{ drawSize }],
    startDate: DAY,
    endDate: DAY,
    setState: true,
  });
}

const records = () => {
  const { tournamentRecord } = tournamentEngine.getTournament();
  return { [tournamentRecord.tournamentId]: tournamentRecord };
};

/** the matchUps as R<round>.<position> (prefixed by the event's index when there are several), and the courts as C1… */
function labels(): Labels {
  const { tournamentRecord } = tournamentEngine.getTournament();
  const out: Labels = {};
  tournamentRecord.events.forEach((event: any, index: number) => {
    const prefix = tournamentRecord.events.length > 1 ? `E${index}.` : '';
    for (const drawDefinition of event.drawDefinitions ?? [])
      for (const structure of drawDefinition.structures ?? [])
        for (const m of structure.matchUps ?? []) out[`${prefix}R${m.roundNumber}.${m.roundPosition}`] = m.matchUpId;
  });
  tournamentRecord.venues[0].courts.forEach((court: any, index: number) => (out[`C${index + 1}`] = court.courtId));
  return out;
}

/** the date's matchUps as the grid collects a profiled round: no BYE, nothing completed or already on a court */
function roundMatchUps(roundNumbers: number[]) {
  const matchUps =
    allCompetitionMatchUps({
      matchUpFilters: { matchUpTypes: [SINGLES, DOUBLES] },
      tournamentRecords: records(),
      nextMatchUps: true,
    }).matchUps ?? [];
  return roundNumbers.flatMap((roundNumber) =>
    matchUps.filter(
      (m: any) =>
        m.roundNumber === roundNumber &&
        !m.sides?.some((side: any) => side.bye) &&
        !completedMatchUpStatuses.includes(m.matchUpStatus) &&
        !m.schedule?.courtId &&
        !m.schedule?.courtOrder,
    ),
  );
}

function expectEqual(actual: unknown, expected: unknown, what: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** where each labelled matchUp was placed, as `C<court>/<row>` */
function cellsOf(plan: GridDatePlan, ids: Labels, matchUpLabels: string[]) {
  const courtLabel = Object.fromEntries(Object.entries(ids).map(([label, id]) => [id, label]));
  return matchUpLabels.map((label) => {
    const placement = plan.placements.find(({ matchUpId }) => matchUpId === ids[label]);
    return placement ? `${courtLabel[placement.schedule.courtId as string]}/${placement.schedule.courtOrder}` : '—';
  });
}

export const gridCaseSources: Source[] = [
  {
    caseId: 'scheduling.grid.first-open-court-row-by-row.v1',
    note: 'Eight players, two courts: the four first-round matchUps fill row 1 left to right, then row 2.',
    build: () => {
      tournament({ drawSize: 8, courtsCount: 2 });
      return { roundNumbers: [1] };
    },
    claims: (plan, ids) =>
      expectEqual(cellsOf(plan, ids, ['R1.1', 'R1.2', 'R1.3', 'R1.4']), ['C1/1', 'C2/1', 'C1/2', 'C2/2'], 'cells'),
  },
  {
    caseId: 'scheduling.grid.dependent-waits-for-the-next-row.v1',
    note: 'Four players, four courts, both rounds profiled: the final depends on both semifinals, so it is not on their row.',
    build: () => {
      tournament({ drawSize: 4, courtsCount: 4 });
      return { roundNumbers: [1, 2] };
    },
    claims: (plan, ids) => expectEqual(cellsOf(plan, ids, ['R1.1', 'R1.2', 'R2.1']), ['C1/1', 'C2/1', 'C1/2'], 'cells'),
  },
  {
    caseId: 'scheduling.grid.unplaced-source-defers.v1',
    note:
      'One court, the final profiled before the semifinals: while a source is unplaced the final is offered to the next ' +
      'row, so the semifinals take rows 1 and 2 and the final row 3.',
    build: () => {
      tournament({ drawSize: 4, courtsCount: 1 });
      return { roundNumbers: [2, 1] };
    },
    claims: (plan, ids) => expectEqual(cellsOf(plan, ids, ['R1.1', 'R1.2', 'R2.1']), ['C1/1', 'C1/2', 'C1/3'], 'cells'),
  },
  {
    caseId: 'scheduling.grid.over-a-daily-limit.v1',
    note:
      'A limit of one matchUp a day: the semifinals are placed; every player who can reach the final has played once, so ' +
      'the final is over the limit and not placed.',
    build: () => {
      tournament({ drawSize: 4, courtsCount: 2 });
      return { roundNumbers: [1, 2], args: { matchUpDailyLimits: { total: 1 } } };
    },
    claims: (plan, ids) => {
      expectEqual(cellsOf(plan, ids, ['R1.1', 'R1.2', 'R2.1']), ['C1/1', 'C2/1', '—'], 'cells');
      expectEqual(plan.overLimitMatchUpIds, [ids['R2.1']], 'over the limit');
    },
  },
  {
    caseId: 'scheduling.grid.limits-that-only-warn.v1',
    note: 'The same limit, asked only to warn: the final is placed on row 2 and warned.',
    build: () => {
      tournament({ drawSize: 4, courtsCount: 2 });
      return { roundNumbers: [1, 2], args: { matchUpDailyLimits: { total: 1 }, dailyLimitsWarnOnly: true } };
    },
    claims: (plan, ids) => {
      expectEqual(cellsOf(plan, ids, ['R1.1', 'R1.2', 'R2.1']), ['C1/1', 'C2/1', 'C1/2'], 'cells');
      expectEqual(plan.dailyLimitWarningMatchUpIds, [ids['R2.1']], 'warned');
      expectEqual(plan.overLimitMatchUpIds, [], 'over the limit');
    },
  },
  {
    caseId: 'scheduling.grid.court-ids-narrow-the-grid.v1',
    note: 'Three courts, the call names the third: every placement is on it, one row each.',
    build: () => {
      tournament({ drawSize: 4, courtsCount: 3 });
      return { roundNumbers: [1], args: { courtIds: [labels().C3] } };
    },
    claims: (plan, ids) => expectEqual(cellsOf(plan, ids, ['R1.1', 'R1.2']), ['C3/1', 'C3/2'], 'cells'),
  },
  {
    caseId: 'scheduling.grid.a-player-in-two-events-is-not-on-one-row-twice.v1',
    note:
      'The same two players in two events, two courts: their first-round matchUps share both players, so the second ' +
      "is not on the first one's row.",
    build: () => {
      tournament({
        courtsCount: 2,
        drawProfiles: [
          { drawSize: 2, eventName: 'A' },
          { drawSize: 2, eventName: 'B' },
        ],
      });
      return { roundNumbers: [1] };
    },
    claims: (plan, ids) => expectEqual(cellsOf(plan, ids, ['E0.R1.1', 'E1.R1.1']), ['C1/1', 'C1/2'], 'cells'),
  },
];

/**
 * Each source built, planned and held to its claims; the case pins the whole plan. Every source is built on a seeded
 * random source and a fixed clock, so its ids and its view are the same whichever test builds it. Each is also asked
 * the closed-view property: the plan from the view equals the plan from the view written as JSON and read back, and
 * planning leaves the view as it was.
 */
export function authoredGridCases(): KernelCase[] {
  try {
    return gridCaseSources.map(authoredCase);
  } finally {
    setRandomSource();
    setClock();
  }
}

function authoredCase({ caseId, note, build, claims }: Source): KernelCase {
  setRandomSource(20260302);
  setClock('2026-03-01T08:00:00.000Z');
  const { roundNumbers, args } = build();
  const view = buildGridDateView({
    tournamentRecords: records(),
    matchUps: roundMatchUps(roundNumbers),
    scheduledDate: DAY,
    ...args,
  });
  if ('error' in view) throw new Error(`${caseId}: ${JSON.stringify(view.error)}`);
  const data = overTheWire(gridViewData(view));
  const plan = planGridDate(view);
  claims(plan, labels());

  const viaJson = planGridDate(gridViewFromData(overTheWire(data)));
  if (JSON.stringify(viaJson) !== JSON.stringify(plan))
    throw new Error(`${caseId}: the plan read back from JSON differs`);
  if (JSON.stringify(overTheWire(gridViewData(view))) !== JSON.stringify(data))
    throw new Error(`${caseId}: planning changed the view`);

  return {
    caseId,
    operation: 'kernel.scheduling.grid@1',
    input: { view: data },
    expected: { kind: 'value', value: overTheWire(plan) },
    note,
  };
}
