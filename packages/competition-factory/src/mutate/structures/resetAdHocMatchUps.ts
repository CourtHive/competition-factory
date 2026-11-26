import { decideUnit, type UnitRecords } from '@Mutate/matchUps/outcome/plan/recordedUnit';
import { removeMatchUpSideParticipant } from '@Mutate/matchUps/sides/removeMatchUpSideParticipant';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { resetMatchUpLineUps } from '@Mutate/matchUps/lineUps/resetMatchUpLineUps';
import { setMatchUpStatus } from '@Mutate/matchUps/matchUpStatus/setMatchUpStatus';
import { getAdHocStructureDetails } from './getAdHocStructureDetails';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { resetScorecard } from '@Mutate/matchUps/resetScorecard';
import { bulkItem } from '@Mutate/bulkItem';

// constants and types
import { ARRAY, DRAW_DEFINITION, EVENT, MATCHUP_IDS, MESSAGE, OF_TYPE, ONE_OF } from '@Constants/attributeConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { PARTIAL_COMMIT, SUCCESS } from '@Constants/resultConstants';
import { TEAM_EVENT } from '@Constants/eventConstants';
import type { ResultType } from '@Types/factoryTypes';

type ResetAdHocMatchUps = {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  removeAssignments?: boolean;
  roundNumbers?: number[];
  matchUpIds?: string[];
  structureId?: string;
  event: Event;
};

/**
 * Each selected matchUp is reset as one unit: its scorecard and, on request, its line-ups,
 * its blank outcome with what that propagates, and on request its side assignments. The unit is planned whole before
 * any of it is written (`planUnit`): a refusal at any of its steps leaves that matchUp as it was. Every selected matchUp
 * is attempted, in order, and `results` holds one entry per matchUp. The first refusal is the call's own `error`, and
 * the matchUps reset before and after it stay reset, with `committed: true` so that the engine announces them.
 */
export function resetAdHocMatchUps(
  params: ResetAdHocMatchUps,
): ResultType & { results?: ResetResult[]; committed?: boolean } {
  const paramsCheck = checkRequiredParameters(params, [
    { [DRAW_DEFINITION]: true, [EVENT]: true },
    {
      [ONE_OF]: { [MATCHUP_IDS]: false, roundNumbers: false },
      [MESSAGE]: 'At least one must be provided',
      [OF_TYPE]: ARRAY,
    },
  ]);
  if (paramsCheck.error) return paramsCheck;

  const structureResult = getAdHocStructureDetails(params);
  if (structureResult.error) return structureResult;
  const { matchUpIds } = structureResult;

  const isTeam = isMatchUpEventType(TEAM_EVENT)(params.event.eventType);
  const { tournamentRecord, drawDefinition, event } = params;

  // every selected matchUp is attempted, in order, and has its own entry in `results`
  const results: ResetResult[] = [];
  let refusal: ResultType | undefined;
  for (const [index, matchUpId] of matchUpIds.entries()) {
    const run = (records: UnitRecords) => resetMatchUp({ params, records, matchUpId, isTeam });
    // a reset that is only the blank outcome is one call v2 decides (`decideUnit`); a TEAM reset or one that removes
    // assignments writes in several steps, and is planned whole on a copy
    const direct =
      isTeam || params.removeAssignments
        ? undefined
        : (bound: { unowned: ResultType }) =>
            setMatchUpStatus({ tournamentRecord, drawDefinition, matchUpId, event, outcome: toBePlayed, bound });
    const records = { tournamentRecord, drawDefinition, event };
    const result = bulkItem(() => decideUnit({ records, matchUpId, direct, run }));
    if (result.error) {
      refusal ??= result;
      results.push({ index, matchUpId, error: result.error, ...(result.info ? { info: result.info } : {}) });
    } else results.push({ index, matchUpId, success: true });
  }

  // the first refusal is the call's own, as before; matchUps reset around it stay reset, and are announced
  const committed = results.some((entry) => 'success' in entry);
  if (refusal) return { ...refusal, ...(committed ? { [PARTIAL_COMMIT]: true } : {}), results };
  return { ...SUCCESS, results };
}

/** what a reset returns for each selected matchUp, in order: its committed reset or its refusal */
export type ResetResult = { index: number; matchUpId: string } & (
  { success: true } | { error: ResultType['error']; info?: unknown }
);

type ResetMatchUpArgs = { params: ResetAdHocMatchUps; records: UnitRecords; matchUpId: string; isTeam: boolean };

/** one matchUp's reset, as one sequence of writes on the records it is handed */
function resetMatchUp({ params, records, matchUpId, isTeam }: ResetMatchUpArgs): ResultType {
  const { tournamentRecord, drawDefinition, event } = records;
  if (isTeam) {
    const result = resetScorecard({
      tiebreakReset: true,
      tournamentRecord,
      drawDefinition,
      matchUpId,
      event,
    });
    if (result.error) return result;

    if (params.removeAssignments) {
      const resetLineUpResult = resetMatchUpLineUps({
        inheritance: false,
        drawDefinition,
        matchUpId,
      });
      if (resetLineUpResult.error) return resetLineUpResult;
    }
  }

  const result = setMatchUpStatus({
    tournamentRecord,
    drawDefinition,
    matchUpId,
    event: event as Event,
    // the canonical blank: status, score, codes and exit provenance together (as removeMatchUpOutcome does)
    outcome: toBePlayed,
  });
  if (result.error) return result;

  if (params.removeAssignments) {
    const removeResult = removeMatchUpSideParticipant({ ...params, ...records, matchUpId });
    if (removeResult.error) return removeResult;
  }

  return { ...SUCCESS };
}
