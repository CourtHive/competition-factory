import { relabelWithoutDirection } from '@Mutate/matchUps/drawPositions/relabelLoserExit';
import { isDoubleExit, isExit } from '@Validators/isExit';

// constants and types
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import type { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import type { MatchUpsMap, ResultType } from '@Types/factoryTypes';

type RelabelDualExitParams = {
  dualMatchUp?: Pick<MatchUp, 'matchUpId' | 'matchUpStatus' | 'winningSide'>;
  propagateRetirementAsExit?: boolean;
  propagateExitStatus?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  event?: Event;
};

/**
 * A LINE WHOSE TALLY RELABELS ITS DUAL'S OWN EXIT SETTLES THE LOSER AS THE DUAL'S OWN RELABEL DOES (CA, 2026-11-20,
 * class 4).
 *
 * A dual decided by its own exit keeps it while its lines project no winner (`dualKeepsOwnDecision`). Once they project
 * that same winner the tally writes the dual COMPLETED: the exit relabelled a played result, by the same winner. Where the
 * exit was carried to the loser (`propagateExitStatus`), the dual's own relabel withdraws the carry
 * (`relabelWithoutDirection`, `relabelLoserExit`); its line left the carried exit standing in the matchUp the loser
 * reached, from a source no longer an exit (walk FIC8 duo seed 16, 2026-11-20; unreachable before the ruling, when the
 * first line un-decided the dual). Asked after the tally is written, with the line call's own exit flags, as the dual's
 * relabel asks them.
 */
export function relabelDualExitByTally(params: RelabelDualExitParams, tallied?: { winningSide?: number }): ResultType {
  const before = params.dualMatchUp;
  if (!before?.winningSide || !isExit(before.matchUpStatus) || isDoubleExit(before.matchUpStatus)) return {};
  if (!tallied?.winningSide || tallied.winningSide !== before.winningSide) return {};
  const relabelled = relabelWithoutDirection({
    propagateRetirementAsExit: params.propagateRetirementAsExit,
    propagateExitStatus: params.propagateExitStatus,
    tournamentRecord: params.tournamentRecord,
    drawDefinition: params.drawDefinition,
    matchUpsMap: params.matchUpsMap,
    winningSide: before.winningSide,
    matchUpId: before.matchUpId,
    matchUpStatus: COMPLETED,
    event: params.event,
  });
  return relabelled.error ? relabelled : {};
}
