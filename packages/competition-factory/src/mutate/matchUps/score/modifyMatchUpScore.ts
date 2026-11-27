import { updateAssignmentParticipantResults } from '@Mutate/drawDefinitions/matchUpGovernor/updateAssignmentParticipantResults';
import { modifyMatchUpNotice, deferInContextMatchUp, deferredQuery } from '@Mutate/notifications/drawNotifications';
import { attributeRetainedStatusCodes, writeStatusReasons } from '@Mutate/matchUps/matchUpStatus/sideStatusCodes';
import { processCompetitionMatchUp } from '@Mutate/drawDefinitions/competition/processCompetitionMatchUp';
import { clearResolvedSideExitProvenance } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { getCompetitionPolicy } from '@Query/drawDefinition/competition/getCompetitionPolicy';
import type { CallStatusReasons, RetainedStatusCodes } from '@Mutate/matchUps/matchUpStatus/sideStatusCodes';
import { finishingOrderUpdates, getDualLines } from '@Query/matchUp/finishingOrder';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { checkScoreHasValue } from '@Scoring/analysis/checkScoreHasValue';
import { decorateResult } from '@Functions/global/decorateResult';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { isLucky } from '@Query/drawDefinition/isLucky';
import { addNotes } from '@Mutate/base/addRemoveNotes';
import { getTopics } from '@Global/state/globalState';
import { clearsCollectionWinner } from '@Query/matchUp/checkStatusType';
import { isAnyExit } from '@Validators/isExit';
import { unique } from '@Tools/arrays';

// types, constants and fixtures
import { DrawDefinition, Event, MatchUp, MatchUpStatusUnion, Tournament } from '@Types/tournamentTypes';
import { MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';
import { UPDATE_INCONTEXT_MATCHUP } from '@Constants/topicConstants';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { CONTAINER } from '@Constants/drawDefinitionConstants';
import { PolicyDefinitions } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { TEAM } from '@Constants/matchUpTypes';
import {
  AWAITING_RESULT,
  completedMatchUpStatuses,
  DOUBLE_WALKOVER,
  SUSPENDED,
  DEFAULTED,
  WALKOVER,
  IN_PROGRESS,
  INCOMPLETE,
} from '@Constants/matchUpStatusConstants';

/**
 *
 * Single place where matchUp.score can be modified.
 *
 * Mutates passed matchUp object.
 * Moving forward this will be used for integrity checks and any middleware that needs to execute
 *
 */

type ModifyMatchUpScoreArgs = {
  matchUpStatus?: MatchUpStatusUnion;
  appliedPolicies?: PolicyDefinitions;
  tournamentRecord?: Tournament;
  /** the call's own reasons, written when this is the call's matchUp (`writeStatusReasons`) */
  statusReasons?: CallStatusReasons;
  /** an engine write that removes the reasons the matchUp holds (an unwind, a line written with no result) */
  clearsStatusReasons?: boolean;
  /** an engine write that keeps the reasons the matchUp holds, filtered by the result it writes */
  retainedStatusCodes?: RetainedStatusCodes;
  drawDefinition?: DrawDefinition;
  removeWinningSide?: boolean;
  // a winner corrected: the result taken off before the new one is written keeps the line's finishing order
  keepsFinishingOrder?: boolean;
  matchUpFormat?: string;
  removeScore?: boolean;
  winningSide?: number;
  matchUpId: string;
  matchUp: MatchUp; // matchUp without context
  notes?: string;
  context?: any;
  event?: Event;
  score?: any;
};

export function modifyMatchUpScore(params: ModifyMatchUpScoreArgs) {
  const stack = 'modifyMatchUpScore';
  let matchUpFormat = params.matchUpFormat;
  let matchUp = params.matchUp; // matchUp without context
  let structure;

  const { tournamentRecord, drawDefinition, matchUpStatus, removeScore, winningSide, matchUpId, event, notes, score } =
    params;

  const appliedPolicies = resolveAppliedPolicies({
    appliedPolicies: params.appliedPolicies,
    tournamentRecord,
    drawDefinition,
    structure,
    event,
  });

  const isDualMatchUp = matchUp.matchUpType === TEAM;

  const resolvedTarget = resolveDualMatchUpTarget({
    isDualMatchUp,
    drawDefinition,
    matchUpId,
    matchUp,
    event,
  });
  if (resolvedTarget?.error) return resolvedTarget;
  if (resolvedTarget) {
    ({ matchUp, structure } = resolvedTarget);
  }

  const wasDefaulted = matchUpStatus && matchUp?.matchUpStatus === DEFAULTED && matchUpStatus !== DEFAULTED;
  // a dual's line, as it was: its finishing order in its collection follows what this write changes (v2: planner ops)
  const previousLine = matchUp?.collectionId && !params.keepsFinishingOrder ? lineSnapshot(matchUp) : undefined;

  applyScoreAndStatus({
    // it describes ONE matchUp: a params spread that carried it into a write elsewhere does not apply it
    retained: params.retainedStatusCodes?.matchUpId === matchUp.matchUpId ? params.retainedStatusCodes : undefined,
    own: params.statusReasons?.matchUpId === matchUp.matchUpId ? params.statusReasons : undefined,
    clearsStatusReasons: params.clearsStatusReasons,
    removeWinningSide: params.removeWinningSide || clearsCollectionWinner(matchUp, params),
    keepsFinishingOrder: params.keepsFinishingOrder,
    matchUpStatus,
    matchUpFormat,
    removeScore,
    winningSide,
    matchUp,
    score,
  });

  if (!structure && drawDefinition) {
    ({ structure } = findDrawMatchUp({
      drawDefinition,
      matchUpId,
      event,
    }));
  }

  applyInProgressStatus({ matchUpStatus, matchUp });

  let defaultedProcessCodes;
  if ((wasDefaulted && matchUp?.processCodes?.length) || matchUpStatus === DEFAULTED) {
    defaultedProcessCodes = appliedPolicies?.[POLICY_TYPE_SCORING]?.processCodes?.incompleteAssignmentsOnDefault;
  }

  const tallyResult: any = updateTallyIfNeeded({
    isDualMatchUp,
    tournamentRecord,
    drawDefinition,
    matchUpFormat,
    matchUpId,
    structure,
    matchUp,
    event,
  });
  if (tallyResult?.error) return decorateResult({ result: tallyResult, stack });

  // Competition policy processing — per-matchUp mode
  if (drawDefinition && matchUp.winningSide) {
    const { competitionPolicy } = getCompetitionPolicy({ tournamentRecord, drawDefinition, event });
    if (competitionPolicy?.processingGranularity === 'PER_MATCHUP') {
      processCompetitionMatchUp({ tournamentRecord, drawDefinition, matchUp, event });
    }
  }

  if (notes) {
    const result = addNotes({ element: matchUp, notes });
    if (result.error) return decorateResult({ result, stack });
  }

  const tournamentId = tournamentRecord?.tournamentId;
  // the process-codes decision reads the matchUp in context now; the notice's copy is built after the call succeeds
  const inContextMatchUp = defaultedProcessCodes
    ? getInContextMatchUp({ tournamentRecord, drawDefinition, matchUpId })
    : undefined;

  if (drawDefinition && getTopics().topics.includes(UPDATE_INCONTEXT_MATCHUP)) {
    deferInContextMatchUp({
      inContextMatchUp: deferredQuery(getInContextMatchUp, { tournamentRecord, drawDefinition, matchUpId }),
      tournamentId,
      matchUpId,
    });
  }

  applyDefaultedProcessCodes({
    defaultedProcessCodes,
    inContextMatchUp,
    matchUpStatus,
    matchUp,
  });

  // the line's own number lands before its notice; the siblings it moved are announced after it
  const movedSiblings = previousLine ? applyFinishingOrder({ drawDefinition, previousLine }) : [];

  modifyMatchUpNotice({
    eventId: event?.eventId,
    event,
    context: stack,
    drawDefinition,
    tournamentId,
    matchUp,
  });

  if (movedSiblings.length) {
    for (const sibling of movedSiblings) {
      modifyMatchUpNotice({
        eventId: event?.eventId,
        event,
        context: stack,
        drawDefinition,
        tournamentId,
        matchUp: sibling,
      });
    }
  }

  return { ...SUCCESS };
}

function lineSnapshot(matchUp: MatchUp) {
  const { matchUpId, matchUpStatus, score, orderOfFinish, collectionId, collectionPosition } = matchUp;
  return { matchUpId, matchUpStatus, score, orderOfFinish, collectionId, collectionPosition };
}

// the write's finishing-order changes in the line's collection, applied to the stored lines; the siblings it changed
type ApplyFinishingOrderArgs = { drawDefinition?: DrawDefinition; previousLine: ReturnType<typeof lineSnapshot> };
function applyFinishingOrder({ drawDefinition, previousLine }: ApplyFinishingOrderArgs): MatchUp[] {
  const { lines } = getDualLines({ drawDefinition, matchUpId: previousLine.matchUpId });
  const changed: MatchUp[] = [];
  for (const { matchUpId, orderOfFinish } of finishingOrderUpdates({ lines, previous: previousLine })) {
    const line = lines.find((candidate) => candidate.matchUpId === matchUpId);
    if (!line) continue;
    if (orderOfFinish === undefined) delete line.orderOfFinish;
    else line.orderOfFinish = orderOfFinish;
    if (matchUpId !== previousLine.matchUpId) changed.push(line);
  }
  return changed;
}

function resolveAppliedPolicies({ appliedPolicies, tournamentRecord, drawDefinition, structure, event }) {
  const hasPolicies = appliedPolicies && Object.keys(appliedPolicies).length;
  if (hasPolicies) return appliedPolicies;

  return getAppliedPolicies({
    policyTypes: [POLICY_TYPE_SCORING],
    tournamentRecord,
    drawDefinition,
    structure,
    event,
  })?.appliedPolicies;
}

function resolveDualMatchUpTarget({ isDualMatchUp, drawDefinition, matchUpId, matchUp, event }) {
  if (isDualMatchUp && drawDefinition) {
    if (matchUpId && matchUp.matchUpId !== matchUpId) {
      const findResult = findDrawMatchUp({
        drawDefinition,
        matchUpId,
        event,
      });
      if (!findResult.matchUp) return { error: MATCHUP_NOT_FOUND };
      return { matchUp: findResult.matchUp, structure: findResult.structure };
    }
    return undefined;
  }

  return undefined;
}

function applyScoreAndStatus({
  keepsFinishingOrder,
  clearsStatusReasons,
  removeWinningSide,
  retained,
  own,
  matchUpStatus,
  matchUpFormat,
  removeScore,
  winningSide,
  matchUp,
  score,
}) {
  const walkoverStatuses = new Set([WALKOVER, DOUBLE_WALKOVER]);
  if ((matchUpStatus && walkoverStatuses.has(matchUpStatus)) || removeScore) {
    // `toBePlayed` is the UNWOUND-matchUp fixture, so it blanks `sideExitProvenance` along with the
    // score. Here it is being used to clear the SCORE — a walkover has none — while the very next
    // lines set an exit status on the same matchUp. Letting the reset take the provenance with it
    // makes the field depend on which exit status is being written: the set above covers WALKOVER
    // and DOUBLE_WALKOVER but not DEFAULTED or DOUBLE_DEFAULT, so a walkover loses its provenance
    // while an otherwise identical default keeps it.
    //
    // WHAT THIS IS ACTUALLY LOAD-BEARING FOR — measured 2026-09-19 by REVERTING it on `dev` after
    // the unwind was corrected (#4935), which is the only way to find out.
    //
    // The asymmetry above was originally reported by `doubleExitStatusParity` for
    // FIRST_ROUND_LOSER_CONSOLATION 16/16. **That test now passes WITHOUT this rescue** — 108/108 —
    // because the corrected unwind retains the provenance the reset used to destroy. So the reason
    // recorded when this landed is no longer the reason it has to stay.
    //
    // What breaks without it is REFUSALS. Five assertions across four files stop being able to
    // score a matchUp at all — `byeAdvancesIntoPendingDoubleExit`, `onwardLoserPlacementsRemoved`
    // (explicitly `ERR_UNCHANGED_CANNOT_CHANGE_WINNING_SIDE`), `pendingDoubleExitNotActive` x2 and
    // `swapOriginStructure` — each asserting `result.error` is undefined and each getting an error.
    // Provenance lost here makes a produced exit unrecognisable to the downstream guards
    // (`isActiveDownstream`, `hasPropagatedExitDownstream`), which then refuse a mutation a director
    // is entitled to make. That is the load. Do not remove this on the strength of the parity test
    // passing.
    // BYE IS RESCUED TOO, because the guard on the very next line already decided that question
    // the other way. `clearResolvedSideExitProvenance` excludes BYE from clearing ON PURPOSE — the
    // rule that a BYE is never won and that in both cases the BYE remains a BYE, applied to the
    // record rather than the status — while `isAnyExit` excludes BYE, so this rescue destroyed exactly
    // what that one protects. Two adjacent guards disagreeing about one status.
    //
    // It matters because the propagation writers reach here with `matchUpStatus: holdsBye ? BYE : EXIT`.
    const survivingProvenance = isAnyExit(matchUpStatus) ? matchUp.sideExitProvenance : undefined;
    // A matchUp-level `matchUpFormat` SURVIVES the blank: the format is a property
    // of the match, not of its result. The fixture carries `matchUpFormat: undefined` because it is
    // the unwound-matchUp shape, and until this line a clear erased a format a director had set on
    // one match. Measured by the corpus on real records before it was decided.
    const survivingFormat = matchUp.matchUpFormat;
    Object.assign(matchUp, { ...toBePlayed });
    if (survivingProvenance) matchUp.sideExitProvenance = survivingProvenance;
    if (survivingFormat) matchUp.matchUpFormat = survivingFormat;
  } else if (score) {
    matchUp.score = score;
  }

  if (matchUpStatus) matchUp.matchUpStatus = matchUpStatus;
  // a matchUp that is no longer complete has no place in its cohort's order of finish (`setOrderOfFinish`); v2 clears
  // it in the same writes (outcome/ops.ts)
  if (!keepsFinishingOrder && !completedMatchUpStatuses.includes(matchUp.matchUpStatus)) delete matchUp.orderOfFinish;
  if (matchUpFormat) matchUp.matchUpFormat = matchUpFormat;
  /**
   * THE REASONS A WRITE KEEPS. A call's own reasons are written on its matchUp once the winner is
   * (`writeStatusReasons`, below). An engine write on another matchUp either removes the reasons it held
   * (`clearsStatusReasons`: the result they described is gone) or keeps those that still describe the result it
   * writes (`retainedStatusCodes`), plus a reason a propagation carries with the arriving side. A write that says
   * neither leaves them as they are.
   */
  if (!own && retained) {
    const attributed = attributeRetainedStatusCodes({
      // the write below removes a stale winner, so a double exit does not read one here
      winningSide: removeWinningSide ? undefined : (winningSide ?? matchUp.winningSide),
      matchUpStatus: matchUpStatus ?? matchUp.matchUpStatus,
      carried: retained.sideStatusCodes,
      matchUp,
    });
    if (attributed.matchUpStatusCode) matchUp.matchUpStatusCode = attributed.matchUpStatusCode;
    else delete matchUp.matchUpStatusCode;
    if (attributed.sideStatusCodes) matchUp.sideStatusCodes = attributed.sideStatusCodes;
    else delete matchUp.sideStatusCodes;
  } else if (!own && clearsStatusReasons) {
    delete matchUp.matchUpStatusCode;
    delete matchUp.sideStatusCodes;
  }
  clearResolvedSideExitProvenance(matchUp);
  if (winningSide) matchUp.winningSide = winningSide;
  if (removeWinningSide) matchUp.winningSide = undefined;
  if (own) writeStatusReasons(matchUp, own);
}

function applyInProgressStatus({ matchUpStatus, matchUp }) {
  const nonProgressStatuses = new Set([AWAITING_RESULT, SUSPENDED, INCOMPLETE]);
  if (
    matchUpStatus &&
    !matchUp.winningSide &&
    checkScoreHasValue(matchUp) &&
    !completedMatchUpStatuses.includes(matchUpStatus) &&
    !nonProgressStatuses.has(matchUpStatus)
  ) {
    matchUp.matchUpStatus = IN_PROGRESS;
  }
}

/** a TEAM dual's round robin group is tallied under this one format, whatever its lines' (the outcome view reads it, S7) */
export const DUAL_TALLY_FORMAT = 'SET1-S:T100';

function updateTallyIfNeeded({
  isDualMatchUp,
  tournamentRecord,
  drawDefinition,
  matchUpFormat,
  matchUpId,
  structure,
  matchUp,
  event,
}) {
  if (matchUp.collectionId) return undefined;

  const isRoundRobin = structure?.structureType === CONTAINER;
  const isAdHocStructure = isAdHoc({ structure });

  if (!isLucky({ drawDefinition, structure }) && !isAdHocStructure && !isRoundRobin) return undefined;

  const resolvedFormat = isDualMatchUp
    ? DUAL_TALLY_FORMAT
    : (matchUpFormat ??
      matchUp.matchUpFormat ??
      structure?.matchUpFormat ??
      drawDefinition?.matchUpFormat ??
      event?.matchUpFormat);

  const matchUpFilters = isDualMatchUp ? { matchUpTypes: [TEAM] } : undefined;
  const tallyStructure = isRoundRobin
    ? structure.structures.find((itemStructure) => {
        return itemStructure?.matchUps.find((m) => m.matchUpId === matchUpId);
      }) || structure
    : structure;

  // A GROUP INHERITS ITS CONTAINER'S FORMAT. Hydrated out of its container, a group matchUp storing no format of its
  // own fell past the container to the draw's, so where the two differ (record soak 2026-11-18, class D8) its sets were
  // annotated under another format than every other read gives them (whole-draw hydration, the structural index), and a
  // match tiebreak the container's format decides the match by was credited no game
  const inheriting =
    isRoundRobin && tallyStructure !== structure && !tallyStructure.matchUpFormat && structure.matchUpFormat
      ? { ...tallyStructure, matchUpFormat: structure.matchUpFormat }
      : tallyStructure;

  const { matchUps } = getAllStructureMatchUps({
    structure: inheriting,
    afterRecoveryTimes: false,
    tournamentRecord,
    inContext: true,
    matchUpFilters,
    drawDefinition,
    event,
  });

  if (isAdHocStructure) {
    tallyStructure.positionAssignments = unique(
      matchUps.flatMap((m) => (m.sides ?? []).map((side) => side.participantId)).filter(Boolean),
    ).map((participantId) => ({ participantId }));
  }

  const result = updateAssignmentParticipantResults({
    positionAssignments: tallyStructure.positionAssignments,
    matchUpFormat: resolvedFormat,
    tournamentRecord,
    drawDefinition,
    matchUps,
    event,
  });

  if (result.error) return result;
  return { matchUpFormat: resolvedFormat };
}

export function getInContextMatchUp({ tournamentRecord, drawDefinition, matchUpId }) {
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  if (!matchUpsMap) return undefined;

  return getAllDrawMatchUps({
    matchUpFilters: { matchUpIds: [matchUpId] },
    nextMatchUps: true,
    tournamentRecord,
    inContext: true,
    drawDefinition,
    matchUpsMap,
  }).matchUps?.[0];
}

function applyDefaultedProcessCodes({ defaultedProcessCodes, inContextMatchUp, matchUpStatus, matchUp }) {
  if (!Array.isArray(defaultedProcessCodes) || !inContextMatchUp) return;
  if (inContextMatchUp.sides?.every(({ participantId }) => participantId)) return;

  if (matchUpStatus === DEFAULTED) {
    matchUp.processCodes = unique([...(matchUp.processCodes ?? []), ...defaultedProcessCodes]);
  } else {
    for (const processCode of defaultedProcessCodes ?? []) {
      const codeIndex = processCode && matchUp?.processCodes?.lastIndexOf(processCode);
      matchUp?.processCodes?.splice(codeIndex, 1);
    }
  }
}
