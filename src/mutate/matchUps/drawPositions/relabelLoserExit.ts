import { removeOnwardLoserPlacements } from '@Mutate/matchUps/drawPositions/removeOnwardLoserPlacements';
import { withdrawProducedExits } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { applyWithdrawnExits } from '@Mutate/matchUps/matchUpStatus/applyWithdrawnExits';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { isAnyExit } from '@Validators/isExit';

// constants and types
import { BYE, COMPLETED, DEFAULTED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import { MappedMatchUps, MatchUpsMap } from '@Types/factoryTypes';
import { HydratedMatchUp } from '@Types/hydrated';

type RelabelArgs = {
  validExitToPropagate: boolean;
  propagateExitStatus?: boolean;
  loserParticipantId?: string;
  sourceMatchUpId?: string;
  targetStructureId: string;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  event?: Event;
};

/**
 * A RELABEL: the source matchUp keeps its winner but changes what it says about the loser, after the
 * loser was already directed (CA, 2026-10-02). Under exit propagation:
 *
 * - **to an exit** (a COMPLETED result re-entered as a WALKOVER or DEFAULTED): the exit is CARRIED to
 *   the matchUp the loser now stands in, as it would have been had the exit been entered first.
 *   Returned as `carry: true`; the caller hands it to the ordinary `progressExitStatus` cascade.
 * - **away from an exit** (a WALKOVER or DEFAULTED re-entered as COMPLETED): the exit this source
 *   carried there is WITHDRAWN, and an advancement it awarded is released.
 *
 * Neither applies where that matchUp already has a result of its own: a score, a decided status, or
 * (for the withdrawal) a walkover winner who has since played on. The loser then stays as they are.
 *
 * "Where the loser now stands" is the earliest matchUp of the target structure holding them that is
 * not a BYE: a loser fed opposite a BYE has already passed it, and their next opponent is there.
 */
export function relabelLoserExit(args: RelabelArgs): { carry?: boolean } {
  const { propagateExitStatus, loserParticipantId, sourceMatchUpId, drawDefinition } = args;
  if (!propagateExitStatus || !loserParticipantId || !sourceMatchUpId) return {};

  const inContextDrawMatchUps = getAllDrawMatchUps({
    tournamentRecord: args.tournamentRecord,
    matchUpsMap: args.matchUpsMap,
    inContext: true,
    drawDefinition,
    event: args.event,
  }).matchUps;
  const standing = standingMatchUp(inContextDrawMatchUps, args.targetStructureId, loserParticipantId);
  if (!standing) return {};

  const carriedHere = standing.sideExitProvenance
    ? Object.values(standing.sideExitProvenance).some((entry: any) => entry?.sourceMatchUpId === sourceMatchUpId)
    : false;

  if (args.validExitToPropagate) return { carry: !carriedHere && !hasResult(standing) };
  if (carriedHere && !winnerPlayedOn(standing, inContextDrawMatchUps, drawDefinition)) {
    withdraw(args, standing);
    // the loser no longer lost there, so what losing there directed them to is not theirs either: a
    // structure fed from this one (COMPASS, OLYMPIC) already holds them, and their placement in it goes
    removeOnwardLoserPlacements({
      structureId: standing.structureId as string,
      tournamentRecord: args.tournamentRecord,
      participantId: loserParticipantId,
      matchUpsMap: args.matchUpsMap,
      drawDefinition,
    });
  }
  return {};
}

function standingMatchUp(matchUps: HydratedMatchUp[] | undefined, structureId: string, participantId: string) {
  return (matchUps ?? [])
    .filter(
      (matchUp) =>
        matchUp.structureId === structureId &&
        matchUp.matchUpStatus !== BYE &&
        matchUp.sides?.some((side) => side?.participantId === participantId),
    )
    .sort((a, b) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0))[0];
}

/** a result of its own: a score, or a decided status other than an exit this cascade can still move */
function hasResult(matchUp: HydratedMatchUp): boolean {
  return (
    !!checkScoreHasValue({ score: matchUp.score }) ||
    !!matchUp.winningSide ||
    matchUp.matchUpStatus === COMPLETED ||
    isAnyExit(matchUp.matchUpStatus)
  );
}

/** the carried exit's winner has advanced and that next matchUp already has a result */
function winnerPlayedOn(standing: HydratedMatchUp, matchUps: HydratedMatchUp[] | undefined, drawDefinition) {
  if (!standing.winningSide) return false;
  const nextId = positionTargets({
    inContextDrawMatchUps: matchUps,
    matchUpId: standing.matchUpId,
    inContextMatchUp: standing,
    drawDefinition,
  }).targetMatchUps?.winnerMatchUp?.matchUpId;
  const next = nextId ? matchUps?.find((matchUp) => matchUp.matchUpId === nextId) : undefined;
  return !!next && hasResult(next);
}

function withdraw(args: RelabelArgs, standing: HydratedMatchUp) {
  // scoped to the ONE matchUp the loser stands in: the source's id also names the winner's ARRIVAL in
  // their next matchUp, and that is not an exit to withdraw
  const stored = args.matchUpsMap?.drawMatchUps?.find((matchUp: MatchUp) => matchUp.matchUpId === standing.matchUpId);
  if (!stored) return;
  const mappedMatchUps = {
    [args.targetStructureId]: { matchUps: [stored], itemStructureIds: [] },
  } as MappedMatchUps;
  const withdrawnExits = withdrawProducedExits({
    sourceMatchUpId: args.sourceMatchUpId,
    drawDefinition: args.drawDefinition,
    mappedMatchUps,
  });
  applyWithdrawnExits({
    tournamentRecord: args.tournamentRecord,
    drawDefinition: args.drawDefinition,
    matchUpsMap: args.matchUpsMap,
    event: args.event,
    withdrawnExits,
  });
}

/**
 * The same relabel on the route that directs nobody: the winner has already played on, so
 * `winningSideWithDownstreamDependencies` writes the status and score alone and `directLoser` never
 * runs (exit-cascade census seed 9000522, DEFAULTED re-entered as COMPLETED). Returns the context that
 * hands a carry to `setMatchUpStatus`'s `progressExitStatus` cascade, as `directParticipants` would (the
 * exiting side's reason is read from the source's side-keyed codes); a withdrawal is performed here.
 */
export function relabelWithoutDirection(params: {
  propagateRetirementAsExit?: boolean;
  propagateExitStatus?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap?: MatchUpsMap;
  matchUpStatus?: string;
  winningSide?: number;
  matchUpId: string;
  event?: Event;
}): { context?: Record<string, unknown> } {
  const { matchUpId, matchUpStatus, winningSide, drawDefinition } = params;
  if (!params.propagateExitStatus || !winningSide) return {};

  const inContextDrawMatchUps = getAllDrawMatchUps({
    tournamentRecord: params.tournamentRecord,
    matchUpsMap: params.matchUpsMap,
    inContext: true,
    drawDefinition,
    event: params.event,
  }).matchUps;
  const targetData = positionTargets({ inContextDrawMatchUps, drawDefinition, matchUpId });
  const loserMatchUp = targetData.targetMatchUps?.loserMatchUp;
  const targetStructureId = targetData.targetLinks?.loserTargetLink?.target?.structureId;
  if (!loserMatchUp || !targetStructureId) return {};

  const source = inContextDrawMatchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);
  const loserParticipantId = source?.sides?.find((side) => side?.sideNumber === 3 - winningSide)?.participantId;
  const propagating = params.propagateRetirementAsExit ? [RETIRED, WALKOVER, DEFAULTED] : [WALKOVER, DEFAULTED];

  const { carry } = relabelLoserExit({
    validExitToPropagate: propagating.includes(matchUpStatus ?? ''),
    propagateExitStatus: params.propagateExitStatus,
    tournamentRecord: params.tournamentRecord,
    matchUpsMap: params.matchUpsMap,
    sourceMatchUpId: matchUpId,
    event: params.event,
    loserParticipantId,
    targetStructureId,
    drawDefinition,
  });
  if (!carry) return {};

  return {
    context: {
      matchUpsMap: params.matchUpsMap,
      sourceMatchUpStatus: matchUpStatus,
      sourceWinningSide: winningSide,
      sourceMatchUpId: matchUpId,
      progressExitStatus: true,
      loserParticipantId,
      loserMatchUp,
    },
  };
}
