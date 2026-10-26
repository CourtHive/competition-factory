import {
  buildConflictsView,
  checkConflicts,
  conflictsViewData,
  conflictsViewFromData,
  ConflictsResult,
} from '@Mutate/matchUps/schedule/pipeline/gridConflicts';
import { POLICY_SCHEDULING_DEFAULT } from '@Fixtures/policies/POLICY_SCHEDULING_DEFAULT';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { setRandomSource } from '@Tools/prng';
import { setClock } from '@Tools/clock';
import { overTheWire } from './kernel';

// constants and types
import type { KernelCase } from './kernel';

/**
 * The authored `kernel.scheduling.conflicts@1` cases: one small court grid per conflict the grid reports
 * (pro-scheduling.md, Conflict Types), each held to CLAIMS on the first issue each matchUp receives, then pinned whole
 * (`KERNEL_SCHEDULING_CASES=write` rewrites the file). The default scheduling policy times every matchUp: a best-of-3
 * standard set averages 90 minutes and recovers 60.
 */
const DAY = '2026-03-02';
const VENUE = 'venue-1';

type Cell = { court: number; order: number; time?: string };
type Source = {
  caseId: string;
  note: string;
  useDeepDependencies?: boolean;
  build: (labels: () => Labels) => void;
  claims: (issues: Issues, ids: Labels) => void;
};
type Labels = { [label: string]: string };
type Issues = { [matchUpId: string]: string };

function tournament(drawProfiles: any[]) {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ venueId: VENUE, courtsCount: 4, startTime: '08:00', endTime: '22:00' }],
    policyDefinitions: POLICY_SCHEDULING_DEFAULT,
    startDate: DAY,
    endDate: DAY,
    drawProfiles,
    setState: true,
  });
}

/** the matchUps as R<round>.<position> (E<event>. first when there are several events), the courts as C1… */
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

/** each labelled matchUp on its court and order (and time), as one bulk write; a BYE is placed when asked */
function place(cells: { [label: string]: Cell }, ids: Labels) {
  const matchUpDetails = Object.entries(cells).map(([label, { court, order, time }]) => ({
    matchUpId: ids[label],
    schedule: {
      scheduledDate: DAY,
      courtId: ids[`C${court}`],
      venueId: VENUE,
      courtOrder: order,
      ...(time ? { scheduledTime: time } : {}),
    },
  }));
  const result: any = tournamentEngine.bulkScheduleMatchUps({ matchUpDetails, scheduleByeMatchUps: true });
  if (!result.success) throw new Error(`placing: ${JSON.stringify(result.error)}`);
}

/** each matchUp's first issue, as `<severity> <type>` */
function issuesOf(result: ConflictsResult): Issues {
  return Object.fromEntries(
    result.rowIssues.flat().map(({ matchUpId, issue, issueType }) => [matchUpId, `${issue} ${issueType}`]),
  );
}

function expectEqual(actual: unknown, expected: unknown, what: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const twoEvents = () => tournament([{ drawSize: 2 }, { drawSize: 2 }]);

export const conflictsCaseSources: Source[] = [
  {
    caseId: 'scheduling.conflicts.target-before-its-sources-is-an-error.v1',
    note: 'The final on row 1, its semifinals on row 2: a dependent in an earlier row than its source is an ERROR.',
    build: (ids) => {
      tournament([{ drawSize: 4 }]);
      place({ 'R2.1': { court: 1, order: 1 }, 'R1.1': { court: 1, order: 2 }, 'R1.2': { court: 2, order: 2 } }, ids());
    },
    claims: (issues, ids) =>
      expectEqual(
        [issues[ids['R2.1']], issues[ids['R1.1']], issues[ids['R1.2']]],
        Array(3).fill('ERROR matchUpConflict'),
        'issues',
      ),
  },
  {
    caseId: 'scheduling.conflicts.a-court-slot-held-twice.v1',
    note: 'Both semifinals on court 1, order 1: a double booking, a CONFLICT on each.',
    build: (ids) => {
      tournament([{ drawSize: 4 }]);
      place({ 'R1.1': { court: 1, order: 1 }, 'R1.2': { court: 1, order: 1 } }, ids());
    },
    claims: (issues, ids) =>
      expectEqual(
        [issues[ids['R1.1']], issues[ids['R1.2']]],
        ['CONFLICT courtDoubleBooking', 'CONFLICT courtDoubleBooking'],
        'issues',
      ),
  },
  {
    caseId: 'scheduling.conflicts.one-player-twice-on-a-row.v1',
    note: 'The same two players in two events, both matchUps on row 1: a participant CONFLICT on each.',
    build: (ids) => {
      twoEvents();
      place({ 'E0.R1.1': { court: 1, order: 1 }, 'E1.R1.1': { court: 2, order: 1 } }, ids());
    },
    claims: (issues, ids) =>
      expectEqual(
        [issues[ids['E0.R1.1']], issues[ids['E1.R1.1']]],
        ['CONFLICT participantConflict', 'CONFLICT participantConflict'],
        'issues',
      ),
  },
  {
    caseId: 'scheduling.conflicts.back-to-back-short-of-recovery.v1',
    note:
      'The same two players on rows 1 and 2, at 10:00 and 11:00: play ends 11:30 and recovery 12:30, after the second ' +
      'begins, so the later matchUp is WARNED (the earlier, on a row already judged, keeps no issue).',
    build: (ids) => {
      twoEvents();
      place(
        { 'E0.R1.1': { court: 1, order: 1, time: '10:00' }, 'E1.R1.1': { court: 2, order: 2, time: '11:00' } },
        ids(),
      );
    },
    claims: (issues, ids) =>
      expectEqual(
        [issues[ids['E0.R1.1']], issues[ids['E1.R1.1']]],
        [undefined, 'WARNING participantConflict'],
        'issues',
      ),
  },
  {
    caseId: 'scheduling.conflicts.back-to-back-with-recovery-is-clear.v1',
    note: 'The same rows at 10:00 and 13:00: recovery ends 12:30, before the second begins, so neither is warned.',
    build: (ids) => {
      twoEvents();
      place(
        { 'E0.R1.1': { court: 1, order: 1, time: '10:00' }, 'E1.R1.1': { court: 2, order: 2, time: '13:00' } },
        ids(),
      );
    },
    claims: (issues, ids) => expectEqual([issues[ids['E0.R1.1']], issues[ids['E1.R1.1']]], [null, null], 'issues'),
  },
  {
    caseId: 'scheduling.conflicts.a-walkover-asks-no-recovery.v1',
    note: 'As short of recovery as before, but the first matchUp is a walkover: it was not played and asks no recovery.',
    build: (ids) => {
      twoEvents();
      const labelled = ids();
      place(
        { 'E0.R1.1': { court: 1, order: 1, time: '10:00' }, 'E1.R1.1': { court: 2, order: 2, time: '11:00' } },
        labelled,
      );
      const { tournamentRecord } = tournamentEngine.getTournament();
      const result: any = tournamentEngine.setMatchUpStatus({
        drawId: tournamentRecord.events[0].drawDefinitions[0].drawId,
        outcome: { matchUpStatus: 'WALKOVER', winningSide: 1 },
        matchUpId: labelled['E0.R1.1'],
      });
      if (!result.success) throw new Error(`walkover: ${JSON.stringify(result.error)}`);
    },
    claims: (issues, ids) => expectEqual(issues[ids['E1.R1.1']], undefined, 'the later matchUp'),
  },
  {
    caseId: 'scheduling.conflicts.a-dependent-in-the-same-row.v1',
    note: 'A semifinal and the final on row 1: the final depends on it, a CONFLICT.',
    build: (ids) => {
      tournament([{ drawSize: 4 }]);
      place({ 'R1.1': { court: 1, order: 1 }, 'R2.1': { court: 2, order: 1 } }, ids());
    },
    claims: (issues, ids) => expectEqual(issues[ids['R2.1']]?.split(' ')[0], 'CONFLICT', 'the final'),
  },
  {
    caseId: 'scheduling.conflicts.no-row-for-the-rounds-between.v1',
    note: 'A quarterfinal on row 1 and the final on row 2: two rounds back, no row for the semifinal, an ISSUE.',
    build: (ids) => {
      tournament([{ drawSize: 8 }]);
      place({ 'R1.1': { court: 1, order: 1 }, 'R3.1': { court: 2, order: 2 } }, ids());
    },
    claims: (issues, ids) =>
      expectEqual(
        [issues[ids['R1.1']], issues[ids['R3.1']]],
        ['ISSUE matchUpConflict', 'ISSUE matchUpConflict'],
        'issues',
      ),
  },
  {
    caseId: 'scheduling.conflicts.next-row-another-court-short-of-recovery.v1',
    note: 'A semifinal on row 1 of court 1 at 10:00, the final on row 2 of court 2 at 11:00: a WARNING on both.',
    build: (ids) => {
      tournament([{ drawSize: 4 }]);
      place({ 'R1.1': { court: 1, order: 1, time: '10:00' }, 'R2.1': { court: 2, order: 2, time: '11:00' } }, ids());
    },
    claims: (issues, ids) => expectEqual(issues[ids['R2.1']]?.split(' ')[0], 'WARNING', 'the final'),
  },
  {
    caseId: 'scheduling.conflicts.the-target-follows-its-source-on-its-court.v1',
    note:
      'The same, with the final on row 2 of court 1: following its source on the court, it has no order warning; its ' +
      "players are still back to back short of recovery, so its warning is the participants'.",
    build: (ids) => {
      tournament([{ drawSize: 4 }]);
      place({ 'R1.1': { court: 1, order: 1, time: '10:00' }, 'R2.1': { court: 1, order: 2, time: '11:00' } }, ids());
    },
    claims: (issues, ids) => expectEqual(issues[ids['R2.1']], 'WARNING participantConflict', 'the final'),
  },
  {
    caseId: 'scheduling.conflicts.a-bye-holding-a-court.v1',
    note: 'Three players, a BYE in round one: placed on a court, it is WARNED (a court nobody will play on).',
    build: (ids) => {
      mocksEngine.generateTournamentRecord({
        venueProfiles: [{ venueId: VENUE, courtsCount: 4, startTime: '08:00', endTime: '22:00' }],
        drawProfiles: [{ drawSize: 4, participantsCount: 3 }],
        policyDefinitions: POLICY_SCHEDULING_DEFAULT,
        startDate: DAY,
        endDate: DAY,
        setState: true,
      });
      const labelled = ids();
      const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
      const bye = matchUps.find((m: any) => m.matchUpStatus === 'BYE');
      labelled.BYE = bye.matchUpId;
      place({ BYE: { court: 1, order: 1 } }, labelled);
    },
    claims: (issues) => expectEqual(Object.values(issues), ['WARNING byeScheduledOnCourt'], 'issues'),
  },
  {
    caseId: 'scheduling.conflicts.a-court-time-before-the-order-before-it.v1',
    note: 'Court 1: order 1 at 11:00, order 2 at 10:00, different draws: order 2 is WARNED for its time.',
    build: (ids) => {
      tournament([{ drawSize: 2 }, { drawSize: 2, uniqueParticipants: true }]);
      place(
        { 'E0.R1.1': { court: 1, order: 1, time: '11:00' }, 'E1.R1.1': { court: 1, order: 2, time: '10:00' } },
        ids(),
      );
    },
    claims: (issues, ids) =>
      expectEqual(
        [issues[ids['E0.R1.1']], issues[ids['E1.R1.1']]],
        [undefined, 'WARNING courtTimeOrderConflict'],
        'issues',
      ),
  },
];

/**
 * Each source built, checked and held to its claims; the case pins the whole result. Each is also asked the
 * closed-view property: the result from the view equals the result from the view written as JSON and read back.
 */
export function authoredConflictsCases(): KernelCase[] {
  try {
    return conflictsCaseSources.map(authoredCase);
  } finally {
    setRandomSource();
    setClock();
  }
}

function authoredCase({ caseId, note, useDeepDependencies = false, build, claims }: Source): KernelCase {
  setRandomSource(20260302);
  setClock('2026-03-01T08:00:00.000Z');
  build(labels);
  const { tournamentRecord } = tournamentEngine.getTournament();
  const tournamentRecords = { [tournamentRecord.tournamentId]: tournamentRecord };
  const matchUps =
    tournamentEngine.allCompetitionMatchUps({ matchUpFilters: { scheduledDate: DAY }, nextMatchUps: true }).matchUps ??
    [];
  const view = buildConflictsView({ tournamentRecords, useDeepDependencies, matchUps });
  const data = overTheWire(conflictsViewData(view));
  const result = checkConflicts(view);
  claims(issuesOf(result), labels());

  const viaJson = checkConflicts(conflictsViewFromData(overTheWire(data)));
  if (JSON.stringify(viaJson) !== JSON.stringify(result)) throw new Error(`${caseId}: the result read back differs`);

  return {
    caseId,
    operation: 'kernel.scheduling.conflicts@1',
    input: { view: data },
    expected: { kind: 'value', value: overTheWire(result) },
    note,
  };
}
