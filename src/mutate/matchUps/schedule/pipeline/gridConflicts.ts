import { getParticipantReachability, getReachableParticipantIds } from '../scheduleMatchUps/getParticipantReachability';
import { normalizeTimes, requirementFor, resolveAnchors } from '@Query/matchUps/scheduling/getParticipantRest';
import { courtTimeOrderConflicts, usesNoCourtTime } from '../schedulers/proScheduler/courtTimeOrder';
import { getLeanMatchUpDependencies } from '@Query/matchUps/getLeanMatchUpDependencies';
import { getTournamentTimeZone } from '@Query/tournaments/getTournamentTimeZone';
import { makeTimingResolver } from '@Query/matchUps/scheduling/schedulingTiming';
import { getParticipantClashes } from '../scheduleMatchUps/participantClashes';
import { isFinished } from '@Query/matchUps/scheduling/getMatchUpReadiness';
import { matchUpSort } from '@Functions/sorters/matchUpSort';
import { matchUpWillNeverBePlayed } from '../byeScheduling';
import { wasPlayed } from '@Query/reports/recoveryTimeline';
import { generateRange, unique } from '@Tools/arrays';
import { ensureInt } from '@Tools/ensureInt';

// constants and types
import type { ParticipantReachability } from '../scheduleMatchUps/getParticipantReachability';
import type { NormalizedTimes } from '@Query/matchUps/scheduling/getParticipantRest';
import type { SchedulingTiming } from '@Query/matchUps/scheduling/schedulingTiming';
import type { MatchUpStatusUnion, Tournament } from '@Types/tournamentTypes';
import { BYE } from '@Constants/matchUpStatusConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import {
  SCHEDULE_CONFLICT,
  SCHEDULE_WARNING,
  SCHEDULE_ERROR,
  SCHEDULE_ISSUE,
  CONFLICT_MATCHUP_ORDER,
  CONFLICT_PARTICIPANTS,
  CONFLICT_POTENTIAL_PARTICIPANTS,
  CONFLICT_COURT_DOUBLE_BOOKING,
  CONFLICT_BYE_SCHEDULED,
  CONFLICT_EXIT_SCHEDULED,
  CONFLICT_POSITION_LINK,
  CONFLICT_COURT_TIME_ORDER,
} from '@Constants/scheduleConstants';

/**
 * The grid's conflicts, split as the grid's plan is: the VIEW they are judged from, resolved once from the records and
 * the grid's matchUps (the dependency graph read from the stored draws, reachability, each matchUp's times and timing,
 * whether it was played or will never be), and the CHECK, a function of the view alone (`kernel.scheduling.conflicts@1`).
 * `proConflicts` is the two, with each matchUp's first issue written onto its schedule.
 */

/** of a grid matchUp, what the check reads: its place, its order, its edges, and what the view resolved for it */
export type ConflictsMatchUp = {
  matchUpId: string;
  drawId?: string;
  matchUpType?: string;
  matchUpStatus?: MatchUpStatusUnion;
  stage?: string;
  stageSequence?: number;
  roundNumber?: number;
  roundPosition?: number;
  winnerMatchUpId?: string;
  loserMatchUpId?: string;
  schedule: { courtId?: string; courtOrder?: number | string; scheduledDate?: string; scheduledTime?: string };
  /** a BYE, or an exit the cascade produced: nobody will play it */
  neverPlayed: boolean;
  /** an outcome that put nobody on the court (`usesNoCourtTime`) */
  noCourtTime: boolean;
  finished: boolean;
  played: boolean;
  /** its times as instants, the tournament's zone applied (without a zone, the UTC instants are left out) */
  times: NormalizedTimes;
  timing: SchedulingTiming;
};

export type ConflictsView = {
  matchUps: ConflictsMatchUp[];
  matchUpDependencies: {
    [matchUpId: string]: { matchUpIds: string[]; dependentMatchUpIds: string[]; sources: string[][] };
  };
  positionDependencies: { [structureId: string]: string[] };
  reachability: ParticipantReachability;
  useDeepDependencies: boolean;
};

export type ConflictIssue = { matchUpId: string; issue: string; issueType: string; issueIds: string[] };
export type ConflictsResult = {
  courtIssues: { [courtId: string]: ConflictIssue[] };
  rowIssues: ConflictIssue[][];
};

type BuildConflictsViewArgs = {
  tournamentRecords: { [key: string]: Tournament };
  useDeepDependencies?: boolean;
  matchUps: HydratedMatchUp[];
};

/** the view the grid's conflicts are judged from. NOTE: matchUps are assumed to be { inContext, nextMatchUps } */
export function buildConflictsView({
  useDeepDependencies = false,
  tournamentRecords,
  matchUps,
}: BuildConflictsViewArgs): ConflictsView {
  const drawIds = unique(matchUps.map(({ drawId }) => drawId));
  // the graph's participant dependencies are never read here, so it is read from the stored draws (no hydration)
  const depsResult = getLeanMatchUpDependencies({ tournamentRecords, drawIds });
  const matchUpDependencies = depsResult.matchUpDependencies;
  const reachability = getParticipantReachability({ matchUpDependencies, matchUps });

  // each tournament's timing resolver and zone, made once; a matchUp finds its tournament by id (else the first)
  const tournaments = Object.values(tournamentRecords).map((tournamentRecord) => ({
    timeZone: getTournamentTimeZone({ tournamentRecord }).timeZone,
    resolveTiming: makeTimingResolver(tournamentRecord),
    tournamentId: tournamentRecord.tournamentId,
  }));
  const tournamentOf = (matchUp: HydratedMatchUp) =>
    tournaments.find(({ tournamentId }) => tournamentId === matchUp.tournamentId) ?? tournaments[0];

  const resolved = matchUps.map((matchUp): ConflictsMatchUp => {
    const tournament = tournamentOf(matchUp);
    const timeZone = tournament.timeZone;
    const normalized = normalizeTimes(matchUp, { utcOffsetMinutes: 0, timeZone });
    const { courtId, courtOrder, scheduledDate, scheduledTime } = matchUp.schedule ?? {};
    return {
      matchUpId: matchUp.matchUpId,
      drawId: matchUp.drawId,
      matchUpType: matchUp.matchUpType,
      matchUpStatus: matchUp.matchUpStatus,
      stage: matchUp.stage,
      stageSequence: matchUp.stageSequence,
      roundNumber: matchUp.roundNumber,
      roundPosition: matchUp.roundPosition,
      winnerMatchUpId: matchUp.winnerMatchUpId,
      loserMatchUpId: matchUp.loserMatchUpId,
      schedule: { courtId, courtOrder, scheduledDate, scheduledTime },
      neverPlayed: matchUpWillNeverBePlayed({ matchUp }),
      noCourtTime: usesNoCourtTime(matchUp),
      finished: isFinished(matchUp),
      played: wasPlayed(matchUp),
      times: timeZone ? normalized : { ...normalized, calledMs: null, scoredMs: null, scoredDate: null },
      timing: tournament.resolveTiming(matchUp),
    };
  });

  return {
    positionDependencies: useDeepDependencies ? (depsResult.positionDependencies ?? {}) : {},
    matchUps: resolved,
    matchUpDependencies,
    useDeepDependencies,
    reachability,
  };
}

const MS_PER_MINUTE = 60_000;

/**
 * Whether the participants coming out of `earlier` have had their recovery before `later` begins.
 *
 * Adjacent rows of a grid are an order of play, not a clock: a matchUp in the row after another can start hours
 * later. Back to back is worth a warning only when the time between them is short of recovery, so this reads the
 * times (CA 2026-10-18: "when the scheduled time leaves enough time for recovery (average matchUp time plus
 * recovery) then the warning should go away entirely").
 *
 * What actually happened wins over the plan, on both sides:
 * - the earlier matchUp is free at the strongest plausible rung of the rest ladder (`resolveAnchors`: endTime,
 *   scoredTime, then startTime / calledAt / scheduledTime plus averageMinutes);
 * - the later matchUp begins at its startTime, else its calledAt, else its scheduledTime;
 * - recovery is the earlier matchUp's, or the type-change figure across singles and doubles (`requirementFor`).
 *
 * `calledAt` and `scoredTime` are UTC instants while the other times are venue wall clock, so the view keeps the
 * instants only when the tournament's zone is known. A matchUp that finished without being played (a walkover) asks no
 * recovery. Anything that cannot be placed in time is not rested: the warning stays when the times cannot clear it.
 */
function restedBetween(earlier?: ConflictsMatchUp, later?: ConflictsMatchUp): boolean {
  if (!earlier || !later) return false;
  if (earlier.finished && !earlier.played) return true;
  const free = resolveAnchors(earlier.times, earlier.timing).find((anchor) => !anchor.implausible);
  const { startMs, calledMs, scheduledMs } = later.times;
  const begins = startMs ?? calledMs ?? scheduledMs;
  if (!free || begins === null) return false;
  const { requiredMinutes } = requirementFor(
    earlier as unknown as HydratedMatchUp,
    later as unknown as HydratedMatchUp,
    earlier.timing,
  );
  return begins >= free.ms + requiredMinutes * MS_PER_MINUTE;
}

type Profile = { sourceMatchUpIds: string[]; targetMatchUpIds: string[]; matchUpIds: string[] };

/**
 * The grid's conflicts from its view: per row and per court, each matchUp's first issue by severity (ERROR, CONFLICT,
 * ISSUE, WARNING). A matchUp keeps the first issue it receives.
 */
export function checkConflicts(view: ConflictsView): ConflictsResult {
  const { matchUpDependencies: deps, positionDependencies: positionDeps, reachability, useDeepDependencies } = view;
  const matchUps = view.matchUps;

  const maxCourtOrder = Math.max(
    ...matchUps.map(({ schedule }) => schedule?.courtOrder || 1).map((order) => ensureInt(order)),
  );
  const filteredRows = generateRange(1, maxCourtOrder + 1).map((courtOrder) =>
    matchUps.filter((m) => ensureInt(m.schedule?.courtOrder) === courtOrder),
  );

  const rowIndices: { [key: string]: number } = {};
  const courtIssues: ConflictsResult['courtIssues'] = {};
  const mappedMatchUps: { [matchUpId: string]: ConflictsMatchUp } = {};
  const annotated = new Set<string>();

  const sortedFiltered = filteredRows
    .flat()
    .filter(Boolean)
    .sort((a, b) => matchUpSort(a as never, b as never));

  const drawIdOf = (matchUpId: string) => mappedMatchUps[matchUpId]?.drawId;
  const rested = (earlierId: string, laterId: string) =>
    restedBetween(mappedMatchUps[earlierId], mappedMatchUps[laterId]);

  // each matchUp of a clashing pair cites the other, so an issue names only the matchUps it actually clashes with
  const partnersOf = (pairs: [string, string][]): { [key: string]: string[] } => {
    const partners: { [key: string]: Set<string> } = {};
    for (const [a, b] of pairs) {
      (partners[a] ??= new Set()).add(b);
      (partners[b] ??= new Set()).add(a);
    }
    return Object.fromEntries(Object.entries(partners).map(([matchUpId, ids]) => [matchUpId, [...ids]]));
  };

  const rowProfiles = filteredRows.map((row, rowIndex) =>
    row.reduce(
      (profile: Profile, matchUp) => {
        if (!matchUp.matchUpId) return profile;
        const { matchUpId, winnerMatchUpId, loserMatchUpId, schedule } = matchUp;
        const courtId = schedule?.courtId;
        rowIndices[matchUpId] = rowIndex;
        if (courtId) courtIssues[courtId] = [];
        profile.matchUpIds.push(matchUpId);
        mappedMatchUps[matchUpId] = matchUp;
        const sourceMatchUpIds = deps[matchUpId].matchUpIds;
        if (sourceMatchUpIds.length) profile.sourceMatchUpIds.push(...sourceMatchUpIds);
        if (winnerMatchUpId) profile.targetMatchUpIds.push(winnerMatchUpId);
        if (loserMatchUpId) profile.targetMatchUpIds.push(loserMatchUpId);
        return profile;
      },
      { sourceMatchUpIds: [], targetMatchUpIds: [], matchUpIds: [] },
    ),
  );

  const sourceDistance = (a: string, b: string) =>
    deps[a].sources.reduce((distance, round, index) => (round.includes(b) && index + 1) || distance, 0);

  const rowIssues: ConflictIssue[][] = rowProfiles.map(() => []);

  type ParticipantConflicts = { [matchUpId: string]: { [state: string]: string[] } };

  // a participant who can play a matchUp on each of two adjacent rows has them back to back, which is a warning only
  // when the time between them is short of recovery; winner and loser paths of one feeder are alternatives
  const processParticipantWarnings = (previousRow: Profile, row: Profile, conflicts: ParticipantConflicts) => {
    const { clashingPairs } = getParticipantClashes({
      otherMatchUpIds: previousRow.matchUpIds,
      matchUpIds: row.matchUpIds,
      reachability,
      drawIdOf,
    });
    const shortOfRecovery = clashingPairs.filter(([matchUpId, previousId]) => !rested(previousId, matchUpId));
    for (const [matchUpId, warnedMatchUpIds] of Object.entries(partnersOf(shortOfRecovery))) {
      conflicts[matchUpId] ??= {};
      conflicts[matchUpId][SCHEDULE_WARNING] ??= warnedMatchUpIds;
    }
  };

  // a participant who can play two matchUps on one row is asked to be in two places at once, unless the two are
  // alternatives for them (a feeder's winner path and loser path)
  const processParticipantConflicts = (row: Profile): ParticipantConflicts => {
    const conflicts: ParticipantConflicts = {};
    const { clashingPairs } = getParticipantClashes({ matchUpIds: row.matchUpIds, reachability, drawIdOf });
    for (const [matchUpId, conflictedMatchUpIds] of Object.entries(partnersOf(clashingPairs))) {
      conflicts[matchUpId] ??= {};
      conflicts[matchUpId][SCHEDULE_CONFLICT] ??= conflictedMatchUpIds;
    }
    return conflicts;
  };

  const processCourtDoubleBooking = (row: ConflictsMatchUp[]): { [key: string]: string[] } => {
    const doubleBookingConflicts: { [key: string]: string[] } = {};
    const courtSlots: { [key: string]: string[] } = {};
    row.forEach(({ matchUpId, schedule }) => {
      if (!matchUpId || !schedule?.courtId || !schedule?.scheduledDate) return;
      const slotKey = `${schedule.courtId}|${schedule.scheduledDate}`;
      courtSlots[slotKey] ??= [];
      courtSlots[slotKey].push(matchUpId);
    });
    Object.values(courtSlots).forEach((matchUpIds) => {
      if (matchUpIds.length > 1) {
        matchUpIds.forEach((matchUpId) => {
          doubleBookingConflicts[matchUpId] = matchUpIds.filter((id) => id !== matchUpId);
        });
      }
    });
    return doubleBookingConflicts;
  };

  const annotate = (matchUpId: string, issue: string, issueType: string, issueIds: string[]) => {
    if (annotated.has(matchUpId)) return;
    annotated.add(matchUpId);
    rowIssues[rowIndices[matchUpId]].push({ matchUpId, issueType, issueIds, issue });
    const courtId = mappedMatchUps[matchUpId].schedule.courtId as string;
    courtIssues[courtId] ??= [];
    courtIssues[courtId].push({ matchUpId, issue, issueType, issueIds });
  };

  rowProfiles.forEach((row, rowIndex) => {
    const previousRow = rowIndex ? rowProfiles[rowIndex - 1] : undefined;
    const subsequentRows = rowProfiles.slice(rowIndex + 1);

    const participantConflicts = processParticipantConflicts(row);
    const doubleBookingConflicts = processCourtDoubleBooking(
      filteredRows[rowIndex].filter((m) => row.matchUpIds.includes(m.matchUpId)),
    );
    if (previousRow) processParticipantWarnings(previousRow, row, participantConflicts);

    row.matchUpIds.forEach((matchUpId) => {
      const sourceMatchUpIds = deps[matchUpId].matchUpIds;
      const matchUp = mappedMatchUps[matchUpId];

      // IMPORTANT: maintain order of annotations: SCHEDULE_STATE values progress from ERROR => CONFLICT => WARNING

      // ERRORS
      for (const subsequentRow of subsequentRows) {
        const sourceAfter = subsequentRow.matchUpIds.filter((id) => sourceMatchUpIds.includes(id));
        if (sourceAfter?.length) {
          sourceAfter.forEach((id) => annotate(id, SCHEDULE_ERROR, CONFLICT_MATCHUP_ORDER, [matchUpId]));
          annotate(matchUpId, SCHEDULE_ERROR, CONFLICT_MATCHUP_ORDER, sourceAfter);
        }
      }

      // CONFLICTS: court double booking (same court, same order, same date), participants, order within the row
      if (doubleBookingConflicts[matchUpId]) {
        annotate(matchUpId, SCHEDULE_CONFLICT, CONFLICT_COURT_DOUBLE_BOOKING, doubleBookingConflicts[matchUpId]);
      }
      if (participantConflicts[matchUpId]?.[SCHEDULE_CONFLICT]) {
        annotate(
          matchUpId,
          SCHEDULE_CONFLICT,
          CONFLICT_PARTICIPANTS,
          participantConflicts[matchUpId][SCHEDULE_CONFLICT],
        );
      }
      if (row.sourceMatchUpIds.includes(matchUpId)) {
        const sources = row.matchUpIds.filter((id) => deps[id].matchUpIds.includes(matchUpId));
        annotate(matchUpId, SCHEDULE_CONFLICT, CONFLICT_MATCHUP_ORDER, sources);
        row.matchUpIds
          .filter((id) => deps[id].matchUpIds.includes(matchUpId))
          .forEach((id) => annotate(id, SCHEDULE_CONFLICT, CONFLICT_MATCHUP_ORDER, [matchUpId]));
      }

      // ISSUES
      const insufficientGap = previousRow?.matchUpIds?.filter((id) => sourceDistance(matchUpId, id) > 1);
      if (insufficientGap?.length) {
        annotate(matchUpId, SCHEDULE_ISSUE, CONFLICT_MATCHUP_ORDER, insufficientGap);
        insufficientGap.forEach((id) => annotate(id, SCHEDULE_ISSUE, CONFLICT_MATCHUP_ORDER, [matchUpId]));
      }

      // WARNINGS: a BYE holding a court, an exit the cascade produced holding one, participants back to back
      if (matchUp.matchUpStatus === BYE && matchUp.schedule?.courtId) {
        annotate(matchUpId, SCHEDULE_WARNING, CONFLICT_BYE_SCHEDULED, []);
      } else if (matchUp.schedule?.courtId && matchUp.neverPlayed) {
        annotate(matchUpId, SCHEDULE_WARNING, CONFLICT_EXIT_SCHEDULED, []);
      }
      if (participantConflicts[matchUpId]?.[SCHEDULE_WARNING]) {
        annotate(matchUpId, SCHEDULE_WARNING, CONFLICT_PARTICIPANTS, participantConflicts[matchUpId][SCHEDULE_WARNING]);
      }
      if (previousRow?.targetMatchUpIds?.includes(matchUpId)) {
        // a source in the previous row is a WARNING unless it is on the same court (the target follows it there)
        // or the time between them leaves its participants their recovery
        const consideredCourtId = matchUp.schedule.courtId;
        const previousRowIds = new Set(previousRow.matchUpIds);
        const warningMatchUpIds = sourceMatchUpIds.filter(
          (id) =>
            previousRowIds.has(id) &&
            mappedMatchUps[id].schedule.courtId !== consideredCourtId &&
            !rested(id, matchUpId),
        );
        if (warningMatchUpIds.length) {
          warningMatchUpIds.forEach((id) => annotate(id, SCHEDULE_WARNING, CONFLICT_MATCHUP_ORDER, [matchUpId]));
          annotate(matchUpId, SCHEDULE_WARNING, CONFLICT_MATCHUP_ORDER, warningMatchUpIds);
        }
      }
    });
  });

  if (useDeepDependencies) deepChecks();

  // Last, so it is the lowest-severity annotation: a court-time ordering note must never stand in front of a conflict
  // or an error on the same matchUp.
  for (const { matchUpId, earlierMatchUpId } of courtTimeOrderConflicts(
    sortedFiltered as unknown as HydratedMatchUp[],
    (matchUp) => !!mappedMatchUps[matchUp.matchUpId]?.noCourtTime,
  )) {
    annotate(matchUpId, SCHEDULE_WARNING, CONFLICT_COURT_TIME_ORDER, [earlierMatchUpId]);
  }

  return { courtIssues, rowIssues };

  function deepChecks() {
    const allGridMatchUpIds = new Set(Object.keys(rowIndices));
    const dependentSets: { [key: string]: Set<string> } = {};
    for (const matchUpId of allGridMatchUpIds) {
      dependentSets[matchUpId] = new Set(deps[matchUpId]?.dependentMatchUpIds ?? []);
    }
    let maxSourceDepth = 0;
    for (const matchUpId of allGridMatchUpIds) {
      const sourcesLength = deps[matchUpId]?.sources?.length ?? 0;
      if (sourcesLength > maxSourceDepth) maxSourceDepth = sourcesLength;
    }

    // Pass A: potential participants who can reach two matchUps of a row (or of adjacent rows) however many rounds
    // away, other than the rows' own participants
    const rowParticipantIds = (row: Profile) =>
      new Set(row.matchUpIds.flatMap((matchUpId) => getReachableParticipantIds(reachability, matchUpId).near));
    const warnDeep = (matchUpIds: string[], otherMatchUpIds?: string[], excludeParticipantIds?: Set<string>) => {
      const { clashingPairs } = getParticipantClashes({
        excludeParticipantIds,
        otherMatchUpIds,
        depth: 'all',
        reachability,
        matchUpIds,
        drawIdOf,
      });
      const pairs = otherMatchUpIds
        ? clashingPairs.filter(([matchUpId, previousId]) => !rested(previousId, matchUpId))
        : clashingPairs;
      for (const [matchUpId, clashingMatchUpIds] of Object.entries(partnersOf(pairs))) {
        annotate(matchUpId, SCHEDULE_WARNING, CONFLICT_POTENTIAL_PARTICIPANTS, clashingMatchUpIds);
      }
    };
    rowProfiles.forEach((row, rowIndex) => {
      warnDeep(row.matchUpIds, undefined, rowParticipantIds(row));
      if (rowIndex > 0) {
        const previousRow = rowProfiles[rowIndex - 1];
        const direct = new Set([...rowParticipantIds(row), ...rowParticipantIds(previousRow)]);
        warnDeep(row.matchUpIds, previousRow.matchUpIds, direct);
      }
    });

    // Pass B: insufficient gaps beyond adjacent rows, by source distance
    rowProfiles.forEach((row, rowIndex) => {
      for (const matchUpId of row.matchUpIds) {
        for (let k = 2; k <= Math.min(rowIndex, maxSourceDepth); k++) {
          for (const prevId of rowProfiles[rowIndex - k].matchUpIds) {
            const distance = sourceDistance(matchUpId, prevId);
            if (distance > 0 && k < distance) {
              annotate(matchUpId, SCHEDULE_ISSUE, CONFLICT_MATCHUP_ORDER, [prevId]);
              annotate(prevId, SCHEDULE_ISSUE, CONFLICT_MATCHUP_ORDER, [matchUpId]);
            }
          }
        }
      }
    });

    // Pass C: the dependent direction: a dependent on an earlier row is an ERROR, on the same row a CONFLICT
    rowProfiles.forEach((row, rowIndex) => {
      for (const matchUpId of row.matchUpIds) {
        const dependents = dependentSets[matchUpId];
        if (!dependents?.size) continue;
        for (let k = 0; k < rowIndex; k++) {
          const earlierDependents = rowProfiles[k].matchUpIds.filter((id) => dependents.has(id));
          if (earlierDependents.length) {
            for (const id of earlierDependents) annotate(id, SCHEDULE_ERROR, CONFLICT_MATCHUP_ORDER, [matchUpId]);
            annotate(matchUpId, SCHEDULE_ERROR, CONFLICT_MATCHUP_ORDER, earlierDependents);
          }
        }
        const sameRowDependents = row.matchUpIds.filter((id) => id !== matchUpId && dependents.has(id));
        if (sameRowDependents.length) {
          for (const id of sameRowDependents) annotate(id, SCHEDULE_CONFLICT, CONFLICT_MATCHUP_ORDER, [matchUpId]);
          annotate(matchUpId, SCHEDULE_CONFLICT, CONFLICT_MATCHUP_ORDER, sameRowDependents);
        }
      }
    });

    // Pass D: a target structure's matchUp on the grid whose position-linked sources are not on it at all
    if (Object.keys(positionDeps).length) {
      const positionSourceIdSet = new Set(Object.values(positionDeps).flat());
      rowProfiles.forEach((row) => {
        for (const matchUpId of row.matchUpIds) {
          const sourceMatchUpIds = deps[matchUpId]?.matchUpIds ?? [];
          const relevantSources = sourceMatchUpIds.filter((id) => positionSourceIdSet.has(id));
          const unscheduledSources = relevantSources.filter((id) => !allGridMatchUpIds.has(id));
          if (unscheduledSources.length) {
            annotate(matchUpId, SCHEDULE_WARNING, CONFLICT_POSITION_LINK, unscheduledSources);
          }
        }
      });
    }
  }
}

type EncodedReachability = Omit<ParticipantReachability, 'upstream'> & { upstream: { [matchUpId: string]: string[] } };

/**
 * The conflicts view as plain data (`kernel.scheduling.conflicts@1`): already plain but for the reachability's
 * `upstream` Sets, written as sorted arrays.
 */
export function conflictsViewData(view: ConflictsView): Record<string, unknown> {
  const upstream = Object.fromEntries(
    Object.entries(view.reachability.upstream).map(([matchUpId, ids]) => [
      matchUpId,
      [...ids].sort((a, b) => a.localeCompare(b, 'en')),
    ]),
  );
  return { ...view, reachability: { ...view.reachability, upstream } satisfies EncodedReachability };
}

/** a conflicts view from plain data (`conflictsViewData`), as the check reads it */
export function conflictsViewFromData(data: Record<string, unknown>): ConflictsView {
  const reachability = data.reachability as EncodedReachability;
  const upstream = Object.fromEntries(
    Object.entries(reachability.upstream).map(([matchUpId, ids]) => [matchUpId, new Set(ids)]),
  );
  return { ...data, reachability: { ...reachability, upstream } } as ConflictsView;
}

/** the conflicts view's members a conformance case's input must carry */
export const requiredConflictsViewKeys = () => [
  'matchUps',
  'matchUpDependencies',
  'positionDependencies',
  'reachability',
  'useDeepDependencies',
];
