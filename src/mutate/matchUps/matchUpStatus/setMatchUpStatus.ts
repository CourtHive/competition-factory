import { applyMatchUpFormat } from '@Mutate/matchUps/matchUpFormat/applyMatchUpFormat';
import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { setMatchUpState } from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import { matchUpScore } from '@Assemblies/generators/matchUps/matchUpScore';
import { progressExitStatus } from '../drawPositions/progressExitStatus';
import { getMatchUpFormat } from '@Query/hierarchical/getMatchUpFormat';
import { decorateResult } from '@Functions/global/decorateResult';
import { findPolicy } from '@Acquire/findPolicy';
import { findEvent } from '@Acquire/findEvent';

// constants and types
import { DRAW_DEFINITION, MATCHUP_ID } from '@Constants/attributeConstants';
import { INVALID_WINNING_SIDE } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { PolicyDefinitions } from '@Types/factoryTypes';

/**
 * Sets either matchUpStatus or score and winningSide; values to be set are passed in outcome object.
 * Public API for setting matchUpStatus or score and winningSide.
 */

type SetMatchUpStatusArgs = {
  tournamentRecords?: { [key: string]: Tournament };
  policyDefinitions?: PolicyDefinitions;
  disableScoreValidation?: boolean;
  allowChangePropagation?: boolean;
  propagateExitStatus?: boolean;
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  disableAutoCalc?: boolean;
  enableAutoCalc?: boolean;
  matchUpFormat?: string;
  tournamentId?: string;
  setTBlast?: boolean; // when true, the tiebreak score always appears last in set score string; when false, the tiebreak score is listed in parentheses after the losing set score
  matchUpId: string;
  eventId?: string;
  drawId?: string;
  schedule?: any;
  notes?: string;
  event?: Event;
  outcome?: any;
};
export function setMatchUpStatus(params: SetMatchUpStatusArgs) {
  // DECISION: Validate required parameters before any processing
  // WHY: Fail fast if essential data is missing - matchUpId and drawDefinition are mandatory
  const paramsCheck = checkRequiredParameters(params, [{ [MATCHUP_ID]: true, [DRAW_DEFINITION]: true }]);
  if (paramsCheck.error) return paramsCheck;

  const stack = 'setMatchUpStatus';

  // DECISION: Resolve tournament records to support multi-tournament operations
  // WHY: Enables setting matchUp status across multiple tournaments in a single operation
  const tournamentRecords = resolveTournamentRecords(params);
  // DECISION: Auto-resolve drawDefinition if not provided
  // WHY: Convenience - allows calling with just tournamentId/eventId/drawId instead of passing full objects
  // This makes the API more flexible for different use cases
  if (!params.drawDefinition) {
    const tournamentRecord = params.tournamentRecord ?? (params.tournamentId && tournamentRecords[params.tournamentId]);
    params.tournamentRecord ??= tournamentRecord;

    const result = findEvent({
      eventId: params.eventId,
      drawId: params.drawId,
      tournamentRecord,
    });
    if (result.error) return result;
    if (result.drawDefinition) params.drawDefinition = result.drawDefinition;
    params.event = result.event;
  }

  const {
    disableScoreValidation,
    policyDefinitions,
    tournamentRecord,
    disableAutoCalc,
    enableAutoCalc,
    drawDefinition,
    matchUpId,
    schedule,
    event,
    notes,
  } = params;

  // DECISION: Accept matchUpFormat from either direct param or nested in outcome
  // WHY: Provides flexibility in how API is called - format can be set along with status/score
  const matchUpFormat = params.matchUpFormat || params.outcome?.matchUpFormat;

  // DECISION: Look up scoring policy for this tournament/event
  // WHY: Policies control validation rules and behavior (e.g., whether to require participants for scoring)
  const { policy } = findPolicy({
    policyType: POLICY_TYPE_SCORING,
    tournamentRecord,
    event,
  });

  // DECISION: Determine if winningSide changes should propagate to downstream matchUps
  // WHY: Some tournaments allow changing winners (e.g., after appeals), others don't
  // Priority: explicit param > policy setting > undefined (default behavior)
  const allowChangePropagation =
    (params.allowChangePropagation !== undefined && params.allowChangePropagation) ||
    (policy?.allowChangePropagation !== undefined && policy.allowChangePropagation) ||
    undefined;

  // DECISION: whether an exit status (WALKOVER/DEFAULTED) propagates into the consolation
  // WHY: gated by the scoring policy so a provider can default it on/off; an explicit
  // params.propagateExitStatus === true always overrides the policy (same precedence as
  // allowChangePropagation — an explicit boolean false defers to the policy)
  const propagateExitStatus =
    (params.propagateExitStatus !== undefined && params.propagateExitStatus) ||
    (policy?.propagateExitStatus !== undefined && policy.propagateExitStatus) ||
    undefined;

  const { outcome, setTBlast } = params;

  // DECISION: Validate winningSide is 1 or 2 (or undefined)
  // WHY: winningSide represents which side won - only 1 (side 1) or 2 (side 2) are valid
  // Catching invalid values here prevents downstream errors
  if (outcome?.winningSide && ![1, 2].includes(outcome.winningSide)) {
    return { error: INVALID_WINNING_SIDE };
  }

  // DECISION: Set matchUp format before setting score/status
  // WHY: Format affects score validation (e.g., number of sets, tiebreak rules)
  // Must be set first to ensure score is validated against correct format
  if (matchUpFormat) {
    const result = applyMatchUpFormat({
      tournamentRecord,
      drawDefinition,
      matchUpFormat,
      matchUpId,
      event,
    });
    if (result.error) return result;
  }

  // DECISION: score strings are DERIVED from score.sets — never accepted from the caller
  // WHY: validateScore only type-checks scoreStringSide1/scoreStringSide2; nothing compares them to
  // score.sets. Previously generation was skipped whenever the caller supplied a string, so an
  // integration that sent its own strings bypassed generation permanently and factory persisted
  // strings it could never emit and its own parseScoreString could not round-trip — including
  // set scores present in the string but absent from sets. Regenerating unconditionally makes
  // score.sets the single source of truth. See competition-factory#4564.
  if (outcome?.score?.sets) {
    // DECISION: Filter out empty sets BEFORE generating score strings
    // WHY: Prevents invalid/incomplete sets from being saved, and filtering afterwards left the
    // generated string describing a set that had just been removed from score.sets
    const sets = outcome.score.sets.filter(
      (set) =>
        set.side1Score ||
        set.side2Score ||
        set.side1TiebreakScore ||
        set.side2TiebreakScore ||
        set.side1PointScore ||
        set.side2PointScore,
    );

    // DECISION: resolve the matchUp's effective format rather than relying on outcome.matchUpFormat
    // WHY: generateScoreString needs the format to recognize a tiebreak-only deciding set (F:TB10) and
    // render it as [10-8]. The format usually lives on the matchUp, not on the outcome, so spreading
    // outcome alone left it undefined and the deciding set rendered as a plain game score.
    // Resolution failure yields undefined — the same format-less rendering as before, never worse.
    const formatResult: any = matchUpFormat
      ? undefined
      : getMatchUpFormat({ tournamentRecord, drawDefinition, matchUpId, event });
    const effectiveMatchUpFormat = matchUpFormat ?? formatResult?.matchUpFormat;

    const { score: scoreObject } = matchUpScore({
      ...outcome,
      matchUpFormat: effectiveMatchUpFormat,
      score: { ...outcome.score, sets },
      setTBlast,
    });
    // matchUpScore carries forward every non-derived attribute of the score it was handed
    // (score.side1PointScore and friends), so assigning its result is not lossy
    outcome.score = scoreObject;
  }

  // DECISION: Delegate to setMatchUpState for core status/score setting logic
  // WHY: Separation of concerns - setMatchUpStatus handles API/validation/orchestration,
  // setMatchUpState handles actual state mutations and participant progression logic
  const result = setMatchUpState({
    matchUpStatusCodes: outcome?.matchUpStatusCodes,
    matchUpStatus: outcome?.matchUpStatus,
    winningSide: outcome?.winningSide,
    allowChangePropagation,
    disableScoreValidation,
    score: outcome?.score,
    propagateExitStatus,
    tournamentRecords,
    policyDefinitions,
    tournamentRecord,
    disableAutoCalc,
    enableAutoCalc,
    drawDefinition,
    matchUpFormat,
    matchUpId,
    schedule,
    event,
    notes,
  });
  // DECISION: Check if exit status propagation is needed
  // WHY: When a participant exits via WALKOVER/DEFAULTED/RETIRED, their opponent advances
  // and the exited participant may need to be placed in a consolation draw with the exit status
  // The progressExitStatus flag in context signals this scenario occurred
  if (result.context?.progressExitStatus) {
    // DECISION: Use iterative loop instead of recursion for multi-level propagation
    // WHY: In structures like COMPASS draws, exit status may propagate through multiple levels
    // (e.g., East → West → South → Southeast). Iteration is safer than deep recursion.
    // Failsafe prevents infinite loops if there's a circular reference or bug
    let iterate = true;
    let failsafe = 0;
    while (iterate && failsafe < 10) {
      iterate = false;
      failsafe += 1;

      // DECISION: Call progressExitStatus to set status on consolation matchUp
      // WHY: Participant has been directed to consolation matchUp by directLoser,
      // now we need to set that matchUp's status (e.g., WALKOVER if only one participant)
      const progressResult = progressExitStatus({
        sourceMatchUpStatusCodes: result.context.sourceMatchUpStatusCodes,
        sourceMatchUpStatus: result.context.sourceMatchUpStatus,
        loserParticipantId: result.context.loserParticipantId,
        propagateExitStatus,
        tournamentRecord: params.tournamentRecord,
        loserMatchUp: result.context.loserMatchUp,
        matchUpsMap: result.context.matchUpsMap,
        drawDefinition: params.drawDefinition,
        event: params.event,
      });

      // DECISION: Continue iterating if there's another level of consolation
      // WHY: The consolation matchUp itself might feed into another consolation level
      // If progressResult returns another loserMatchUp, we need to process that too
      if (progressResult.context?.loserMatchUp) {
        Object.assign(result.context, progressResult.context);
        iterate = true;
      }
    }
  }
  return decorateResult({ result, stack });
}
