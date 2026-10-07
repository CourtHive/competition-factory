import { carriedExitStatus, withdrawProducedExits } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { removeOnwardLoserPlacements } from '@Mutate/matchUps/drawPositions/removeOnwardLoserPlacements';
import { releaseAdvancedDrawPositionAcrossLinks } from './releaseLinkedWinnerAdvancement';
import { applyWithdrawnExits } from '@Mutate/matchUps/matchUpStatus/applyWithdrawnExits';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { isAnyExit, isDoubleExit, isExit } from '@Validators/isExit';

// constants and types
import { DrawDefinition, Event, MatchUp, MatchUpStatusUnion, Tournament } from '@Types/tournamentTypes';
import { BYE, COMPLETED, DEFAULTED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { MappedMatchUps, MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { LOSER } from '@Constants/drawDefinitionConstants';
import { HydratedMatchUp } from '@Types/hydrated';

type RelabelArgs = {
  validExitToPropagate: boolean;
  sourceMatchUpStatus?: string;
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
 * A withdrawal is also attempted only where the matchUp still holds what this carry made it, alone or
 * CONVERGED with another exit, and not where a director recorded a result over it (see `onlyThisCarry`).
 * Withdrawn from a convergence, only this source's entry goes: the matchUp re-derives to the kept origin's
 * single exit, and `settleRederivedDoubleExits` (at the end of `setMatchUpStatus`) directs that exit's
 * carrier onward, replacing what the double exit produced (F2).
 *
 * "Where the loser now stands" is the earliest matchUp of the target structure holding them that is
 * not a BYE: a loser fed opposite a BYE has already passed it, and their next opponent is there.
 */
export function relabelLoserExit(args: RelabelArgs): ResultType & { carry?: boolean } {
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
    ? Object.values(standing.sideExitProvenance).some((entry) => entry?.sourceMatchUpId === sourceMatchUpId)
    : false;

  // a walk that cannot read the draw's links refuses the relabel rather than reading as "not played on"
  let refused: ResultType | undefined;
  const withdrawable = () => {
    if (!carriedHere || !onlyThisCarry(standing, loserParticipantId, sourceMatchUpId)) return false;
    const onward = winnerPlayedOn(standing, inContextDrawMatchUps, drawDefinition);
    if (onward.error) {
      refused = onward;
      return false;
    }
    return !onward.playedOn && !loserPlayedOn(standing, inContextDrawMatchUps, drawDefinition, loserParticipantId);
  };
  const withdrawHere = () => {
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
    withdrawOnward(args, standing);
  };

  if (args.validExitToPropagate) {
    if (!carriedHere) {
      // The loser arrived as a participant and WON a produced exit standing there (RULE 2), and now exits at the
      // origin. That win is the cascade's own award, not a result a director recorded, so it is taken back and
      // the carry proceeds: carried in, the exit converges with the produced one, as it does when the exit is
      // entered first (census w2 9100377, MFIC 16/11 `Consolation|3|2`; the round trip F2 left open). A result the
      // loser then EARNED onward stands, and the carry is refused as before.
      if (wonProducedExit(standing, loserParticipantId)) {
        const onward = winnerPlayedOn(standing, inContextDrawMatchUps, drawDefinition);
        if (onward.error) return onward;
        if (onward.playedOn) return {};
        unawardProducedExit(args, standing, loserParticipantId);
        return { carry: true };
      }
      return { carry: !hasResult(standing) };
    }
    // An exit re-entered as the OTHER exit, the winner unchanged (WALKOVER <-> DEFAULTED; CA, 2026-10-04,
    // for a walkover or default recorded before the opponent arrives, which the director may change until
    // they do): the carry follows the label. Withdrawn and carried again, under the same guards as a
    // withdrawal; where the loser or the carry's winner has played on, the carry stands as it was.
    if (!relabelsTheCarry(standing, loserParticipantId, args.sourceMatchUpStatus) || !withdrawable())
      return refused ?? {};
    withdrawHere();
    return { carry: true };
  }
  if (withdrawable()) withdrawHere();
  return refused ?? {};
}

/**
 * The loser stands as the WINNER of a single exit whose other side holds an exit a double exit PRODUCED, with no
 * carried exit of their own and no score: the award a participant arriving at a pending produced exit is given.
 */
function wonProducedExit(standing: HydratedMatchUp, loserParticipantId: string): boolean {
  if (!isExit(standing.matchUpStatus) || checkScoreHasValue({ score: standing.score })) return false;
  const loserSide = standing.sides?.find((side) => side?.participantId === loserParticipantId)?.sideNumber;
  if ((loserSide !== 1 && loserSide !== 2) || standing.winningSide !== loserSide) return false;
  const own = standing.sideExitProvenance?.[loserSide];
  const other = standing.sideExitProvenance?.[3 - loserSide];
  return !carriedExitStatus(own) && !!carriedExitStatus(other) && isDoubleExit(other?.previousMatchUpStatus);
}

/**
 * Take back the award: the produced exit stands pending again, and the loser's advancement out of it is released,
 * round by round and across any winner link, as `releaseAdvancedDrawPosition` releases a position that stopped
 * winning. The carry that follows converges with the pending exit.
 */
function unawardProducedExit(args: RelabelArgs, standing: HydratedMatchUp, loserParticipantId: string) {
  const stored = args.matchUpsMap?.drawMatchUps?.find((matchUp: MatchUp) => matchUp.matchUpId === standing.matchUpId);
  const drawPosition = standing.sides?.find((side) => side?.participantId === loserParticipantId)?.drawPosition;
  if (!stored || !drawPosition || !standing.roundNumber) return;
  releaseAdvancedDrawPositionAcrossLinks({
    structureId: standing.structureId as string,
    fromRoundNumber: standing.roundNumber + 1,
    tournamentRecord: args.tournamentRecord,
    drawDefinition: args.drawDefinition,
    matchUpsMap: args.matchUpsMap,
    occupantLeaving: true,
    event: args.event,
    drawPosition,
  });
  delete stored.winningSide;
}

/** the loser's carried exit says WALKOVER where the source now says DEFAULTED, or the reverse */
function relabelsTheCarry(standing: HydratedMatchUp, loserParticipantId: string, sourceMatchUpStatus?: string) {
  if (sourceMatchUpStatus !== WALKOVER && sourceMatchUpStatus !== DEFAULTED) return false;
  const loserSide = standing.sides?.find((side) => side?.participantId === loserParticipantId)?.sideNumber;
  const carried =
    loserSide === 1 || loserSide === 2 ? standing.sideExitProvenance?.[loserSide]?.matchUpStatus : undefined;
  return (carried === WALKOVER || carried === DEFAULTED) && carried !== sourceMatchUpStatus;
}

/**
 * The matchUp's state is what this source's carried exit made it: that exit's status, awarded to the side
 * opposite the loser, or a double exit with no winner where it CONVERGED with an exit carried in on the other
 * side (withdrawing this origin re-derives the matchUp to the other, and the settle directs its winner).
 * Anything else is a result a director recorded over the carry.
 */
function onlyThisCarry(standing: HydratedMatchUp, loserParticipantId: string, sourceMatchUpId: string): boolean {
  const loserSide = standing.sides?.find((side) => side?.participantId === loserParticipantId)?.sideNumber;
  if (loserSide !== 1 && loserSide !== 2) return false;
  const own = standing.sideExitProvenance?.[loserSide];
  const other = standing.sideExitProvenance?.[loserSide === 1 ? 2 : 1];
  if (own?.sourceMatchUpId !== sourceMatchUpId) return false;
  // converged: withdrawn only where the kept exit was CARRIED, so the settle has a carrier to direct. One PRODUCED by a
  // double exit has none, and re-deriving to it awarded the loser a matchUp nothing then advanced them out of (census
  // w2 9100377, MFIC 16/11 `Consolation|3|2`); that convergence stands, as before (open: OUTCOME_PIPELINE F2)
  if (carriedExitStatus(other)) {
    return isDoubleExit(standing.matchUpStatus) && !standing.winningSide && !isDoubleExit(other?.previousMatchUpStatus);
  }
  return standing.matchUpStatus === own.matchUpStatus && standing.winningSide === (loserSide === 1 ? 2 : 1);
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

/**
 * The carry's winner has a result onward: in the next matchUp, or in the first one past any BYEs they were advanced
 * through. A BYE is passed, not played, so stopping at it missed the match they then won; withdrawing the carry
 * released them from a round they had reached by that result (census w1 9000087, FMLC 16/13: `Consolation|3|1`
 * won, then the winner taken out of `Consolation|4|1` when `Main|1|3`'s walkover was relabelled as played).
 *
 * A CONVERGENCE has no winner; what it decided is the exit it PRODUCED one round on, so the question is asked of
 * that exit's winner. Withdrawing an origin re-derives the convergence and withdraws its produced exit, which
 * would leave whoever won it standing a round further on, advanced out of an undecided matchUp (F2, FMLC 8:
 * `Consolation|2|1`'s produced walkover won, then `Consolation|3|1` played). A clear of the origin is refused
 * there, and the relabel leaves the convergence as it stands.
 */
function winnerPlayedOn(
  standing: HydratedMatchUp,
  matchUps: HydratedMatchUp[] | undefined,
  drawDefinition: DrawDefinition,
): ResultType & { playedOn?: boolean } {
  if (isDoubleExit(standing.matchUpStatus)) {
    const produced = nextPlayable(standing, matchUps, drawDefinition);
    if (produced.error || !produced.next) return produced.error ? produced : { playedOn: false };
    return winnerPlayedOn(produced.next, matchUps, drawDefinition);
  }
  if (!standing.winningSide) return { playedOn: false };
  const onward = nextPlayable(standing, matchUps, drawDefinition);
  if (onward.error) return onward;
  return { playedOn: !!onward.next && hasResult(onward.next) };
}

/** the winner matchUp onward, past any BYEs (bounded, as a draw is); a malformed round link is an error */
function nextPlayable(
  standing: HydratedMatchUp,
  matchUps: HydratedMatchUp[] | undefined,
  drawDefinition: DrawDefinition,
): ResultType & { next?: HydratedMatchUp } {
  let current: HydratedMatchUp | undefined = standing;
  for (let hops = 0; current && hops < 16; hops++) {
    const targetData = positionTargets({
      inContextDrawMatchUps: matchUps,
      matchUpId: current.matchUpId,
      inContextMatchUp: current,
      drawDefinition,
    });
    if (targetData.error) return decorateResult({ result: targetData, stack: 'nextPlayable' });
    const nextId: string | undefined = targetData.targetMatchUps?.winnerMatchUp?.matchUpId;
    const next: HydratedMatchUp | undefined = nextId
      ? matchUps?.find((matchUp) => matchUp.matchUpId === nextId)
      : undefined;
    if (next?.matchUpStatus !== BYE) return { next };
    current = next;
  }
  return {};
}

/**
 * Losing the carried exit sent the loser on (COMPASS, OLYMPIC), and they have a result there already: a
 * matchUp holding them in a structure fed, link after link, from the one they stand in. Withdrawing the
 * exit would leave them in two structures at once, since a result they earned onward is not released.
 */
function loserPlayedOn(
  standing: HydratedMatchUp,
  matchUps: HydratedMatchUp[] | undefined,
  drawDefinition: DrawDefinition,
  participantId: string,
): boolean {
  const onward = new Set<string>();
  const pending = [standing.structureId as string];
  while (pending.length) {
    const sourceStructureId = pending.shift();
    for (const link of drawDefinition.links ?? []) {
      const target = link.target?.structureId;
      if (link.linkType !== LOSER || link.source?.structureId !== sourceStructureId || !target) continue;
      if (onward.has(target) || target === standing.structureId) continue;
      onward.add(target);
      pending.push(target);
    }
  }
  return (matchUps ?? []).some(
    (matchUp) =>
      onward.has(matchUp.structureId as string) &&
      matchUp.sides?.some((side) => side?.participantId === participantId) &&
      hasResult(matchUp) &&
      !carriedFrom(matchUp, participantId),
  );
}

/** the participant's own side of this matchUp was carried in: the exit is the cascade's, not a result they earned */
function carriedFrom(matchUp: HydratedMatchUp, participantId: string): boolean {
  const side = matchUp.sides?.find((candidate) => candidate?.participantId === participantId)?.sideNumber;
  return !!side && !!carriedExitStatus(matchUp.sideExitProvenance?.[side]);
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
 * The matchUp the withdrawal left UNDECIDED produces nothing, so every exit it had carried on is withdrawn too.
 * `withdraw` is scoped to the one matchUp the loser stands in, and `removeOnwardLoserPlacements` takes back its loser's
 * placements but not the exit that loser carried there. Census w1 9000479 (COMPASS 32/29): `East|1|7`'s walkover
 * relabelled as played reverted `West|1|4`, whose loser had carried a WALKOVER into `South|1|2` and converged there;
 * the loser went, its entry stayed, and `South|1|2` stood a double exit with an empty seat and a dead origin.
 * Withdrawn as any undo withdraws a source's products, identity-keyed; a convergence it leaves re-derives, and
 * `settleRederivedDoubleExits` settles it.
 */
function withdrawOnward(args: RelabelArgs, standing: HydratedMatchUp) {
  const stored = args.matchUpsMap?.drawMatchUps?.find((matchUp: MatchUp) => matchUp.matchUpId === standing.matchUpId);
  if (!stored || stored.winningSide || stored.matchUpStatus === BYE || isAnyExit(stored.matchUpStatus)) return;
  const withdrawnExits = withdrawProducedExits({
    mappedMatchUps: args.matchUpsMap?.mappedMatchUps,
    sourceMatchUpId: standing.matchUpId,
    drawDefinition: args.drawDefinition,
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
  matchUpStatus?: MatchUpStatusUnion;
  winningSide?: number;
  matchUpId: string;
  event?: Event;
}): ResultType & { context?: Record<string, unknown> } {
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
  if (targetData.error) return decorateResult({ result: targetData, stack: 'relabelWithoutDirection' });
  const loserMatchUp = targetData.targetMatchUps?.loserMatchUp;
  const targetStructureId = targetData.targetLinks?.loserTargetLink?.target?.structureId;
  if (!loserMatchUp || !targetStructureId) return {};

  const source = inContextDrawMatchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);
  const loserParticipantId = source?.sides?.find((side) => side?.sideNumber === 3 - winningSide)?.participantId;
  const propagating = params.propagateRetirementAsExit ? [RETIRED, WALKOVER, DEFAULTED] : [WALKOVER, DEFAULTED];

  const relabel = relabelLoserExit({
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
  if (relabel.error) return relabel;
  if (!relabel.carry) return {};

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
