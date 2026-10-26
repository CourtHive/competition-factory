import { getParticipantClashes } from '@Mutate/matchUps/schedule/scheduleMatchUps/participantClashes';
import { getLeanMatchUpDependencies } from '@Query/matchUps/getLeanMatchUpDependencies';
import { matchUpWillNeverBePlayed } from '@Mutate/matchUps/schedule/byeScheduling';
import { matchUpSort } from '@Functions/sorters/matchUpSort';
import { courtTimeOrderConflicts } from './courtTimeOrder';
import { validMatchUps } from '@Validators/validMatchUp';
import { generateRange, unique } from '@Tools/arrays';
import { makeRestedBetween } from './restedBetween';
import { ensureInt } from '@Tools/ensureInt';
import {
  getParticipantReachability,
  getReachableParticipantIds,
} from '@Mutate/matchUps/schedule/scheduleMatchUps/getParticipantReachability';

// constants and types
import { ErrorType, MISSING_CONTEXT, MISSING_MATCHUPS } from '@Constants/errorConditionConstants';
import { BYE } from '@Constants/matchUpStatusConstants';
import { Tournament } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';
import {
  SCHEDULE_ISSUE_IDS,
  SCHEDULE_CONFLICT,
  SCHEDULE_WARNING,
  SCHEDULE_ERROR,
  SCHEDULE_ISSUE,
  SCHEDULE_STATE,
  CONFLICT_MATCHUP_ORDER,
  CONFLICT_PARTICIPANTS,
  CONFLICT_POTENTIAL_PARTICIPANTS,
  CONFLICT_COURT_DOUBLE_BOOKING,
  CONFLICT_BYE_SCHEDULED,
  CONFLICT_EXIT_SCHEDULED,
  CONFLICT_POSITION_LINK,
  CONFLICT_COURT_TIME_ORDER,
} from '@Constants/scheduleConstants';

// NOTE: matchUps are assumed to be { inContext: true, nextMatchUps: true }
type ProConflictsArgs = {
  tournamentRecords: { [key: string]: Tournament };
  useDeepDependencies?: boolean;
  matchUps: HydratedMatchUp[];
};
export function proConflicts({
  useDeepDependencies = false,
  tournamentRecords,
  matchUps,
}: ProConflictsArgs):
  { error: ErrorType; info?: any } | { courtIssues: { [key: string]: any }; rowIssues: { [key: string]: any } } {
  if (!validMatchUps(matchUps)) return { error: MISSING_MATCHUPS };
  if (matchUps.some(({ matchUpId, hasContext }) => matchUpId && !hasContext)) {
    return {
      info: 'matchUps must have { inContext: true, nextMatchUps: true }',
      error: MISSING_CONTEXT,
    };
  }

  const maxCourtOrder = Math.max(
    ...matchUps.map(({ schedule }) => schedule?.courtOrder || 1).map((order) => ensureInt(order)),
  );
  const filteredRows = generateRange(1, maxCourtOrder + 1).map((courtOrder) =>
    matchUps.filter((m) => ensureInt(m.schedule?.courtOrder) === courtOrder),
  );

  const rowIndices: { [key: string]: number } = {};
  const courtIssues: { [key: string]: any } = {};
  const mappedMatchUps: any = {};

  const sortedFiltered = filteredRows.flat().filter(Boolean).sort(matchUpSort);

  sortedFiltered.forEach(({ schedule }) => {
    if (schedule) delete schedule[SCHEDULE_STATE];
  });

  const drawIds = unique(matchUps.map(({ drawId }) => drawId));
  // the graph's participant dependencies are never read here, so it is read from the stored draws (no hydration)
  const depsResult = getLeanMatchUpDependencies({ tournamentRecords, drawIds });
  const deps = depsResult.matchUpDependencies;
  const positionDeps = useDeepDependencies ? (depsResult.positionDependencies ?? {}) : {};
  const reachability = getParticipantReachability({ matchUpDependencies: deps, matchUps });
  const drawIdOf = (matchUpId: string) => mappedMatchUps[matchUpId]?.drawId;
  const restedBetween = makeRestedBetween({ tournamentRecords, matchUpOf: (matchUpId) => mappedMatchUps[matchUpId] });

  // each matchUp of a clashing pair cites the other, so an issue names only the matchUps it actually clashes with
  const partnersOf = (pairs: [string, string][]): { [key: string]: string[] } => {
    const partners: { [key: string]: Set<string> } = {};
    for (const [a, b] of pairs) {
      (partners[a] ??= new Set()).add(b);
      (partners[b] ??= new Set()).add(a);
    }
    return Object.fromEntries(Object.entries(partners).map(([matchUpId, ids]) => [matchUpId, [...ids]]));
  };

  type Profile = {
    sourceMatchUpIds: string[];
    targetMatchUpIds: string[];
    participantIds: string[];
    matchUpIds: string[];
  };

  const rowProfiles = filteredRows.map((row, rowIndex) =>
    row.reduce(
      (profile: Profile, matchUp) => {
        if (!matchUp.matchUpId) return profile;

        const { matchUpId, winnerMatchUpId, loserMatchUpId, schedule, sides, potentialParticipants } = matchUp;
        const courtId = schedule?.courtId;
        rowIndices[matchUpId] = rowIndex;
        if (courtId) courtIssues[courtId] = [];

        profile.matchUpIds.push(matchUpId);
        mappedMatchUps[matchUpId] = matchUp;

        const sourceMatchUpIds = deps[matchUpId].matchUpIds;
        sourceMatchUpIds.length && profile.sourceMatchUpIds.push(...sourceMatchUpIds);

        const matchUpParticipantIds =
          sides
            ?.flatMap((side: any) => [side.participant?.individualParticipantIds, side.participantId])
            .flat()
            .filter(Boolean) ?? [];
        const potentialMatchUpParticipantIds =
          potentialParticipants
            ?.flat()
            .flatMap(({ individualParticipantIds, participantId }) => [individualParticipantIds, participantId])
            .flat()
            .filter(Boolean) ?? [];

        profile.participantIds.push(...potentialMatchUpParticipantIds, ...matchUpParticipantIds);

        winnerMatchUpId && profile.targetMatchUpIds.push(winnerMatchUpId);
        loserMatchUpId && profile.targetMatchUpIds.push(loserMatchUpId);

        return profile;
      },
      {
        sourceMatchUpIds: [],
        targetMatchUpIds: [],
        participantIds: [],
        matchUpIds: [],
      },
    ),
  );

  const sourceDistance = (a, b) =>
    deps[a].sources.reduce((distance, round, index) => (round.includes(b) && index + 1) || distance, 0);

  const rowIssues: any[] = rowProfiles.map(() => []);

  const addWarningToMatchUp = (
    matchUpId: string,
    warnedMatchUpIds: string[],
    participantConflicts: { [key: string]: any },
  ) => {
    if (!participantConflicts[matchUpId]) participantConflicts[matchUpId] = {};
    participantConflicts[matchUpId][SCHEDULE_WARNING] ??= warnedMatchUpIds;
  };

  // a participant who can play a matchUp on each of two adjacent rows has them back to back, which is a warning only
  // when the time between them is short of recovery (see restedBetween); winner and loser paths of one feeder are
  // alternatives, not back to back (see getParticipantClashes)
  const processParticipantWarnings = (
    previousRow: Profile,
    row: Profile,
    participantConflicts: { [key: string]: any },
  ) => {
    const { clashingPairs } = getParticipantClashes({
      otherMatchUpIds: previousRow.matchUpIds,
      matchUpIds: row.matchUpIds,
      reachability,
      drawIdOf,
    });
    const shortOfRecovery = clashingPairs.filter(([matchUpId, previousId]) => !restedBetween(previousId, matchUpId));
    for (const [matchUpId, warnedMatchUpIds] of Object.entries(partnersOf(shortOfRecovery))) {
      addWarningToMatchUp(matchUpId, warnedMatchUpIds, participantConflicts);
    }
  };

  const addConflictToMatchUp = (
    matchUpId: string,
    conflictedMatchUpIds: string[],
    participantConflicts: { [key: string]: any },
  ) => {
    if (!participantConflicts[matchUpId]) participantConflicts[matchUpId] = {};
    participantConflicts[matchUpId][SCHEDULE_CONFLICT] ??= conflictedMatchUpIds;
  };

  // a participant who can play two matchUps on one row is asked to be in two places at once, unless the two are
  // alternatives for them (a feeder's winner path and loser path)
  const processParticipantConflicts = (row: Profile): { [key: string]: any } => {
    const participantConflicts: { [key: string]: any } = {};
    const { clashingPairs } = getParticipantClashes({ matchUpIds: row.matchUpIds, reachability, drawIdOf });
    for (const [matchUpId, conflictedMatchUpIds] of Object.entries(partnersOf(clashingPairs))) {
      addConflictToMatchUp(matchUpId, conflictedMatchUpIds, participantConflicts);
    }
    return participantConflicts;
  };

  const processCourtDoubleBooking = (row: HydratedMatchUp[]): { [key: string]: string[] } => {
    const doubleBookingConflicts: { [key: string]: string[] } = {};
    // Group matchUps by courtId and scheduledDate
    const courtSlots: { [key: string]: string[] } = {};

    row.forEach((matchUp) => {
      const { matchUpId, schedule } = matchUp;
      if (!matchUpId || !schedule?.courtId || !schedule?.scheduledDate) return;

      const slotKey = `${schedule.courtId}|${schedule.scheduledDate}`;
      if (!courtSlots[slotKey]) {
        courtSlots[slotKey] = [];
      }
      courtSlots[slotKey].push(matchUpId);
    });

    // Find slots with multiple matchUps (double bookings)
    Object.values(courtSlots).forEach((matchUpIds) => {
      if (matchUpIds.length > 1) {
        matchUpIds.forEach((matchUpId) => {
          doubleBookingConflicts[matchUpId] = matchUpIds.filter((id) => id !== matchUpId);
        });
      }
    });

    return doubleBookingConflicts;
  };

  const annotate = (matchUpId, issue, issueType, issueIds) => {
    if (!mappedMatchUps[matchUpId].schedule[SCHEDULE_STATE]) {
      // store issue for display below by order of severity
      mappedMatchUps[matchUpId].schedule[SCHEDULE_STATE] = issue;
      mappedMatchUps[matchUpId].schedule[SCHEDULE_ISSUE_IDS] = issueIds;

      // update row issues
      rowIssues[rowIndices[matchUpId]].push({
        matchUpId,
        issueType,
        issueIds,
        issue,
      });

      // update court issues
      const courtId = mappedMatchUps[matchUpId].schedule.courtId;
      if (!courtIssues[courtId]) courtIssues[courtId] = [];
      courtIssues[courtId].push({ matchUpId, issue, issueType, issueIds });
    }
  };

  rowProfiles.forEach((row, rowIndex) => {
    const previousRow = rowIndex ? rowProfiles[rowIndex - 1] : undefined;
    const subsequentRows = rowProfiles.slice(rowIndex + 1);

    const participantConflicts = processParticipantConflicts(row);
    const doubleBookingConflicts = processCourtDoubleBooking(
      filteredRows[rowIndex].filter((m) => row.matchUpIds.includes(m.matchUpId)),
    );

    if (previousRow) {
      processParticipantWarnings(previousRow, row, participantConflicts);
    }

    row.matchUpIds.forEach((matchUpId) => {
      const sourceMatchUpIds = deps[matchUpId].matchUpIds;

      // IMPORTANT: maintain order of annotations
      // SCHEDULE_STATE values progress from ERROR => CONFLICT => WARNING

      // ERRORS Section
      for (const subsequentRow of subsequentRows) {
        const sourceAfter = subsequentRow.matchUpIds.filter((id) => sourceMatchUpIds.includes(id));
        if (sourceAfter?.length) {
          sourceAfter.forEach((id) => annotate(id, SCHEDULE_ERROR, CONFLICT_MATCHUP_ORDER, [matchUpId]));
          annotate(matchUpId, SCHEDULE_ERROR, CONFLICT_MATCHUP_ORDER, sourceAfter);
        }
      }

      // CONFLICTS Section
      // Court double booking conflicts (same court, same order, same date)
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

      // if the matchUpId is part of the sources for other row matchUps => conflict
      if (row.sourceMatchUpIds.includes(matchUpId)) {
        const sources = row.matchUpIds.filter((id) => deps[id].matchUpIds.includes(matchUpId));
        annotate(matchUpId, SCHEDULE_CONFLICT, CONFLICT_MATCHUP_ORDER, sources);
        row.matchUpIds
          .filter((id) => deps[id].matchUpIds.includes(matchUpId))
          .forEach((id) => annotate(id, SCHEDULE_CONFLICT, CONFLICT_MATCHUP_ORDER, [matchUpId]));
      }

      // ISSUES Section
      const insufficientGap = previousRow?.matchUpIds?.filter((id) => sourceDistance(matchUpId, id) > 1);
      if (insufficientGap?.length) {
        annotate(matchUpId, SCHEDULE_ISSUE, CONFLICT_MATCHUP_ORDER, insufficientGap);
        insufficientGap.forEach((id) => annotate(id, SCHEDULE_ISSUE, CONFLICT_MATCHUP_ORDER, [matchUpId]));
      }

      // WARNINGS Section
      // A BYE holding a court. Assigning a BYE deliberately PRESERVES scheduling
      // (a director may be mid-swap), so this is not a defect to be auto-corrected
      // — but a court slot that cannot be played on should be visible rather than
      // silently absorbed. Annotated last-but-one in severity so a genuine
      // double-booking or participant conflict on the same matchUp still wins.
      if (mappedMatchUps[matchUpId].matchUpStatus === BYE && mappedMatchUps[matchUpId].schedule?.courtId) {
        annotate(matchUpId, SCHEDULE_WARNING, CONFLICT_BYE_SCHEDULED, []);
      } else if (
        mappedMatchUps[matchUpId].schedule?.courtId &&
        matchUpWillNeverBePlayed({ matchUp: mappedMatchUps[matchUpId] })
      ) {
        // the same slot, taken by an exit the cascade produced: preserved for the same reason, and
        // shown for the same reason — a court nobody will play on reads as free otherwise. A code of
        // its own, so a client can offer "release" against a walkover and "re-seat" against a BYE.
        annotate(matchUpId, SCHEDULE_WARNING, CONFLICT_EXIT_SCHEDULED, []);
      }

      if (participantConflicts[matchUpId]?.[SCHEDULE_WARNING]) {
        annotate(matchUpId, SCHEDULE_WARNING, CONFLICT_PARTICIPANTS, participantConflicts[matchUpId][SCHEDULE_WARNING]);
      }
      if (previousRow?.targetMatchUpIds?.includes(matchUpId)) {
        // a source in the previous row is a WARNING unless it is on the same court (the target follows it there)
        // or the time between them leaves its participants their recovery (see restedBetween)
        const consideredCourtId = mappedMatchUps[matchUpId].schedule.courtId;
        const previousRowIds = new Set(previousRow.matchUpIds);
        const warningMatchUpIds = sourceMatchUpIds.filter(
          (id) =>
            previousRowIds.has(id) &&
            mappedMatchUps[id].schedule.courtId !== consideredCourtId &&
            !restedBetween(id, matchUpId),
        );
        if (warningMatchUpIds.length) {
          warningMatchUpIds.forEach((id) => annotate(id, SCHEDULE_WARNING, CONFLICT_MATCHUP_ORDER, [matchUpId]));
          annotate(matchUpId, SCHEDULE_WARNING, CONFLICT_MATCHUP_ORDER, warningMatchUpIds);
        }
      }
    });
  });

  if (useDeepDependencies) {
    // Pre-compute Set-based lookups for efficiency
    const allGridMatchUpIds = new Set(Object.keys(rowIndices));

    // Build dependentSets: { matchUpId -> Set<dependentMatchUpId> }
    const dependentSets: { [key: string]: Set<string> } = {};
    for (const matchUpId of allGridMatchUpIds) {
      dependentSets[matchUpId] = new Set(deps[matchUpId]?.dependentMatchUpIds ?? []);
    }

    // Compute maxSourceDepth from the dependency data
    let maxSourceDepth = 0;
    for (const matchUpId of allGridMatchUpIds) {
      const sourcesLength = deps[matchUpId]?.sources?.length ?? 0;
      if (sourcesLength > maxSourceDepth) maxSourceDepth = sourcesLength;
    }

    // Pass A: Potential Participant Recovery Conflicts
    // Participants who can reach two matchUps of a row (or of adjacent rows) however many rounds away, other than the
    // row's own participants (reported above). A feeder's winner and loser paths are alternatives, and a participant
    // eliminated by a completed matchUp reaches nothing (see getParticipantClashes and getParticipantReachability).
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
      // across adjacent rows, as for the near potentials: a warning only when short of recovery
      const pairs = otherMatchUpIds
        ? clashingPairs.filter(([matchUpId, previousId]) => !restedBetween(previousId, matchUpId))
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

    // Pass B: Extended sourceDistance Gap Analysis
    // Checks rows beyond just adjacent for insufficient gap based on sourceDistance
    rowProfiles.forEach((row, rowIndex) => {
      for (const matchUpId of row.matchUpIds) {
        for (let k = 2; k <= Math.min(rowIndex, maxSourceDepth); k++) {
          const earlierRow = rowProfiles[rowIndex - k];
          for (const prevId of earlierRow.matchUpIds) {
            const distance = sourceDistance(matchUpId, prevId);
            if (distance > 0 && k < distance) {
              annotate(matchUpId, SCHEDULE_ISSUE, CONFLICT_MATCHUP_ORDER, [prevId]);
              annotate(prevId, SCHEDULE_ISSUE, CONFLICT_MATCHUP_ORDER, [matchUpId]);
            }
          }
        }
      }
    });

    // Pass C: Forward-Looking dependentMatchUpIds Checks
    // Validates ordering from the dependent direction (complementary to source-direction checks)
    rowProfiles.forEach((row, rowIndex) => {
      for (const matchUpId of row.matchUpIds) {
        const dependents = dependentSets[matchUpId];
        if (!dependents?.size) continue;

        // Check earlier rows for dependents (should be ERROR - dependents scheduled before source)
        for (let k = 0; k < rowIndex; k++) {
          const earlierDependents = rowProfiles[k].matchUpIds.filter((id) => dependents.has(id));
          if (earlierDependents.length) {
            for (const id of earlierDependents) {
              annotate(id, SCHEDULE_ERROR, CONFLICT_MATCHUP_ORDER, [matchUpId]);
            }
            annotate(matchUpId, SCHEDULE_ERROR, CONFLICT_MATCHUP_ORDER, earlierDependents);
          }
        }

        // Check same row for dependents (CONFLICT - source and dependent in same row)
        const sameRowDependents = row.matchUpIds.filter((id) => id !== matchUpId && dependents.has(id));
        if (sameRowDependents.length) {
          for (const id of sameRowDependents) {
            annotate(id, SCHEDULE_CONFLICT, CONFLICT_MATCHUP_ORDER, [matchUpId]);
          }
          annotate(matchUpId, SCHEDULE_CONFLICT, CONFLICT_MATCHUP_ORDER, sameRowDependents);
        }
      }
    });

    // Pass D: Cross-Draw Position Link Checks
    // Detects when consolation/target-structure matchUps are scheduled but their position-linked
    // source-structure matchUps are not on the grid at all
    if (Object.keys(positionDeps).length) {
      const positionSourceIdSet = new Set(Object.values(positionDeps).flat() as string[]);

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

  // Last, so it is the lowest-severity annotation: `annotate` keeps the first issue a matchUp receives,
  // and a court-time ordering note must never stand in front of a conflict or an error on the same matchUp.
  for (const { matchUpId, earlierMatchUpId } of courtTimeOrderConflicts(sortedFiltered)) {
    annotate(matchUpId, SCHEDULE_WARNING, CONFLICT_COURT_TIME_ORDER, [earlierMatchUpId]);
  }

  return { courtIssues, rowIssues };
}
