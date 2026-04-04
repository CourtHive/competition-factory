import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { generateRange, instanceCount, unique } from '@Tools/arrays';
import { matchUpSort } from '@Functions/sorters/matchUpSort';
import { validMatchUps } from '@Validators/validMatchUp';
import { ensureInt } from '@Tools/ensureInt';

// Constants and types
import { ErrorType, MISSING_CONTEXT, MISSING_MATCHUPS } from '@Constants/errorConditionConstants';
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
  CONFLICT_POSITION_LINK,
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
  | { error: ErrorType; info?: any }
  | { courtIssues: { [key: string]: any }; rowIssues: { [key: string]: any } } {
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

  sortedFiltered.forEach(({ schedule }) => delete schedule[SCHEDULE_STATE]);

  const drawIds = unique(matchUps.map(({ drawId }) => drawId));
  const depsResult = getMatchUpDependencies({
    includeParticipantDependencies: true,
    tournamentRecords,
    drawIds,
  });
  const deps = depsResult.matchUpDependencies;
  const positionDeps = useDeepDependencies ? (depsResult.positionDependencies ?? {}) : {};

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
        courtIssues[courtId] = [];

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
    if (!participantConflicts[matchUpId][SCHEDULE_WARNING]) {
      participantConflicts[matchUpId][SCHEDULE_WARNING] = warnedMatchUpIds.filter((id) => id !== matchUpId);
    }
  };

  const processParticipantWarnings = (
    previousRow: Profile,
    row: Profile,
    participantConflicts: { [key: string]: any },
  ) => {
    const previousRowWarnings = row.participantIds.filter((id) => previousRow.participantIds.includes(id));
    previousRowWarnings.forEach((participantId) => {
      const warnedMatchUpIds = row.matchUpIds
        .concat(previousRow.matchUpIds)
        .filter((matchUpId) => deps[matchUpId].participantIds.includes(participantId));
      warnedMatchUpIds.forEach((matchUpId) => {
        addWarningToMatchUp(matchUpId, warnedMatchUpIds, participantConflicts);
      });
    });
  };

  const addConflictToMatchUp = (
    matchUpId: string,
    conflictedMatchUpIds: string[],
    participantConflicts: { [key: string]: any },
  ) => {
    if (!participantConflicts[matchUpId]) participantConflicts[matchUpId] = {};
    if (!participantConflicts[matchUpId][SCHEDULE_CONFLICT]) {
      participantConflicts[matchUpId][SCHEDULE_CONFLICT] = conflictedMatchUpIds.filter((id) => id !== matchUpId);
    }
  };

  const processParticipantConflicts = (row: Profile): { [key: string]: any } => {
    const participantConflicts: { [key: string]: any } = {};
    const instances = instanceCount(row.participantIds);
    const conflictedParticipantIds = new Set(Object.keys(instances).filter((key) => instances[key] > 1));
    const conflictedMatchUpIds = row.matchUpIds.filter((matchUpId) =>
      deps[matchUpId].participantIds.some((id) => conflictedParticipantIds.has(id)),
    );
    conflictedMatchUpIds.forEach((matchUpId) => {
      addConflictToMatchUp(matchUpId, conflictedMatchUpIds, participantConflicts);
    });
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
      if (participantConflicts[matchUpId]?.[SCHEDULE_WARNING]) {
        annotate(matchUpId, SCHEDULE_WARNING, CONFLICT_PARTICIPANTS, participantConflicts[matchUpId][SCHEDULE_WARNING]);
      }
      if (previousRow?.targetMatchUpIds?.includes(matchUpId)) {
        // IF: connected matchUps are on the same court with sufficient time between them
        // OR: connected matchUps are on the same court and the target matchUp has 'FOLLOWED_BY'
        // THEN: no WARNING will be given
        const consideredCourtId = mappedMatchUps[matchUpId].schedule.courtId;
        const warningMatchUpIds = sourceMatchUpIds.filter((id) => previousRow.matchUpIds.includes(id));
        const allSameCourt = warningMatchUpIds.some((id) => mappedMatchUps[id].schedule.courtId === consideredCourtId);
        if (!allSameCourt) {
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
    // Detects when deep-propagated participantIds overlap within a row or between adjacent rows
    // Note: deps[matchUpId].participantIds can contain duplicates (e.g., RR players appear
    // once per group match), so we use Sets to map each participant to unique matchUpIds.
    const buildDeepParticipantMap = (row: Profile) => {
      const directParticipantIds = new Set(row.participantIds);
      const deepMap: { [key: string]: Set<string> } = {};
      for (const matchUpId of row.matchUpIds) {
        const depParticipantIds = deps[matchUpId]?.participantIds ?? [];
        for (const id of depParticipantIds) {
          if (!directParticipantIds.has(id)) {
            if (!deepMap[id]) deepMap[id] = new Set();
            deepMap[id].add(matchUpId);
          }
        }
      }
      return deepMap;
    };

    rowProfiles.forEach((row, rowIndex) => {
      const deepParticipantMap = buildDeepParticipantMap(row);

      // Within-row: participants appearing in deep deps of multiple matchUps
      for (const [, matchUpIdSet] of Object.entries(deepParticipantMap)) {
        if (matchUpIdSet.size > 1) {
          const matchUpIds = [...matchUpIdSet];
          for (const matchUpId of matchUpIds) {
            annotate(matchUpId, SCHEDULE_WARNING, CONFLICT_POTENTIAL_PARTICIPANTS, matchUpIds.filter((id) => id !== matchUpId));
          }
        }
      }

      // Adjacent row check: deep participantIds overlapping with previous row's deep participantIds
      if (rowIndex > 0) {
        const previousRow = rowProfiles[rowIndex - 1];
        const previousDeepMap = buildDeepParticipantMap(previousRow);

        // Find overlapping deep participant IDs between rows
        for (const [participantId, currentMatchUpIdSet] of Object.entries(deepParticipantMap)) {
          if (previousDeepMap[participantId]) {
            const involvedMatchUpIds = [...new Set([...currentMatchUpIdSet, ...previousDeepMap[participantId]])];
            for (const matchUpId of involvedMatchUpIds) {
              annotate(matchUpId, SCHEDULE_WARNING, CONFLICT_POTENTIAL_PARTICIPANTS, involvedMatchUpIds.filter((id) => id !== matchUpId));
            }
          }
        }
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

  return { courtIssues, rowIssues };
}
