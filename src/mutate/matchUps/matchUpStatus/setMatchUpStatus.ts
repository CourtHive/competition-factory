import { setMatchUpMatchUpFormat } from '@Mutate/matchUps/matchUpFormat/setMatchUpMatchUpFormat';
import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { setMatchUpState } from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import { matchUpScore } from '@Assemblies/generators/matchUps/matchUpScore';
import { progressExitStatus } from '../drawPositions/progressExitStatus';
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
    if (!params.tournamentRecord) params.tournamentRecord = tournamentRecord;

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
    propagateExitStatus,
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
    const result = setMatchUpMatchUpFormat({
      tournamentRecord,
      drawDefinition,
      matchUpFormat,
      matchUpId,
      event,
    });
    if (result.error) return result;
  }

  // DECISION: Generate score strings from sets if not already provided
  // WHY: Allows API to accept either structured sets data OR pre-formatted score strings
  // This transformation ensures downstream code gets consistent score objects
  if (outcome?.score?.sets && !outcome.score.scoreStringSide1) {
    const { score: scoreObject } = matchUpScore({ ...outcome, setTBlast });
    outcome.score = scoreObject;
    // DECISION: Filter out empty sets (no scores recorded)
    // WHY: Prevents invalid/incomplete sets from being saved
    outcome.score.sets = outcome.score.sets.filter(
      (set) =>
        set.side1Score ||
        set.side2Score ||
        set.side1TiebreakScore ||
        set.side2TiebreakScore ||
        set.side1PointScore ||
        set.side2PointScore,
    );
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
        propagateExitStatus: params.propagateExitStatus,
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
