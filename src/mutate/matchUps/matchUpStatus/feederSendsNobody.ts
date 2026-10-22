import { propagatesByeOnDoubleExit } from '@Mutate/matchUps/drawPositions/propagatesByeOnDoubleExit';
import { getDrawPositionWinCount } from '@Query/matchUp/getDrawPositionWinCount';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { matchUpHoldsBye } from '@Query/drawDefinition/getByeCrossings';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { teamLevelMatchUps } from '@Acquire/teamLevelMatchUps';
import { carriedExitStatus } from './sideExitProvenance';
import { isDoubleExit } from '@Validators/isExit';

// constants and types
import { DrawDefinition, DrawLink, PositionAssignment } from '@Types/tournamentTypes';
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import { PolicyDefinitions } from '@Types/factoryTypes';
import { HydratedMatchUp } from '@Types/hydrated';

/** why the matchUp feeding a loser seat will never send anyone across the link */
export type FeederSendsNobody = 'FEEDER_HOLDS_BYE' | 'DOUBLE_EXIT' | 'NOBODY_LOST' | 'EXIT_PENDING' | 'LINK_EXCLUDES';

/**
 * WILL THE MATCHUP FEEDING A LOSER SEAT EVER SEND ANYONE ACROSS THE LINK? Read from the draw as it stands (Mentat P58).
 *
 * It sends nobody, and the reason is returned, when it
 *
 *  - holds a BYE: a BYE matchUp has no winner or loser, so nothing comes down its loser link (`FEEDER_HOLDS_BYE`);
 *  - is a double exit (`DOUBLE_EXIT`);
 *  - is decided and its losing side holds nobody: it was won against a produced or carried exit (`NOBODY_LOST`);
 *  - is undecided and one side holds a carried exit, which is the side that will lose (`EXIT_PENDING`);
 *  - feeds a FIRST_MATCHUP link and every participant who could lose it already has a scored win, so none crosses
 *    (`getDrawPositionWinCount`, the engine's own eligibility rule; `LINK_EXCLUDES`).
 *
 * Otherwise it returns `undefined`: somebody will cross, or has.
 *
 * Measured 2026-10-21 over 2,493,487 loser-link seat observations in the census gate inputs and 118,803 in the
 * exitPropagation suite: wherever this returns a reason, the seat held a BYE or a carried exit (or was still empty,
 * awaiting the feeder's resolution); wherever it returns `undefined`, the seat never held a propagated BYE. It is the
 * reading that replaces the `byeClaims` ledger, which records who claimed a BYE and so depends on the order results
 * were entered.
 *
 * `withdrawn` names matchUps being unwound, which still read as what they were until the unwind rewrites them. A feeder
 * among them is judged as it will stand: undecided, holding only the exits whose origins are not being withdrawn.
 */
export function feederSendsNobody({
  inContextDrawMatchUps,
  loserTargetLink,
  drawDefinition,
  withdrawn,
  feeder,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  loserTargetLink?: DrawLink;
  withdrawn?: Set<string>;
  feeder: HydratedMatchUp;
}): FeederSendsNobody | undefined {
  if (matchUpHoldsBye({ drawDefinition, matchUp: feeder })) return 'FEEDER_HOLDS_BYE';

  const beingUnwound = !!withdrawn?.has(feeder.matchUpId);
  const originWithdrawn = (sideNumber: number) =>
    !!withdrawn?.has(feeder.sideExitProvenance?.[sideNumber]?.sourceMatchUpId ?? '');
  const carriesAnExit = (sideNumber: number) =>
    carriedExitStatus(feeder.sideExitProvenance?.[sideNumber]) && !originWithdrawn(sideNumber);

  if (!beingUnwound && isDoubleExit(feeder.matchUpStatus)) return 'DOUBLE_EXIT';
  const decided = !beingUnwound && !!feeder.winningSide;
  if (decided) {
    const losingSideNumber = 3 - (feeder.winningSide as number);
    const losingSide = feeder.sides?.find((side) => side?.sideNumber === losingSideNumber);
    if (!losingSide?.participantId && !originWithdrawn(losingSideNumber)) return 'NOBODY_LOST';
  } else if ([1, 2].some(carriesAnExit)) {
    return 'EXIT_PENDING';
  }

  if (loserTargetLink?.linkCondition !== FIRST_MATCHUP) return undefined;
  const earlier = inContextDrawMatchUps.filter(
    (candidate) =>
      candidate.structureId === feeder.structureId && (candidate.roundNumber ?? 0) < (feeder.roundNumber ?? 0),
  );
  const candidates = (feeder.sides ?? []).filter((side) => !decided || side?.sideNumber !== feeder.winningSide);
  const everyCandidateHasWon =
    candidates.length > 0 &&
    candidates.every(
      (side) =>
        !!side?.drawPosition &&
        getDrawPositionWinCount({ sourceMatchUps: teamLevelMatchUps(earlier), drawPosition: side.drawPosition }) > 0,
    );
  return everyCandidateHasWon ? 'LINK_EXCLUDES' : undefined;
}

/**
 * The loser seats holding a propagated BYE that a matchUp is the reason for, read from the draw (Mentat P58): seats it
 * feeds across its loser link; seats fed by a matchUp that carries an exit it produced; and, transitively, seats fed by
 * a matchUp that holds one of those BYEs, since a BYE matchUp sends nobody either. Each is returned as the matchUp the
 * seat belongs to. This is what the `byeClaims` ledger recorded as the matchUp's claims, without depending on the order
 * results were entered.
 */
export function byeSeatsOwedTo({
  inContextDrawMatchUps,
  drawDefinition,
  matchUpId,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  matchUpId: string;
}): HydratedMatchUp[] {
  const sources = new Set<string>([matchUpId]);
  const seats = new Map<string, HydratedMatchUp>();
  const assignmentsOf = new Map<string, PositionAssignment[]>();
  const assignments = (structureId: string) => {
    if (!assignmentsOf.has(structureId))
      assignmentsOf.set(structureId, getPositionAssignments({ drawDefinition, structureId }).positionAssignments ?? []);
    return assignmentsOf.get(structureId) ?? [];
  };
  let grown = true;
  while (grown) {
    grown = false;
    for (const feeder of inContextDrawMatchUps) {
      if (!feeder.loserMatchUpId) continue;
      const fromSource =
        sources.has(feeder.matchUpId) ||
        Object.values(feeder.sideExitProvenance ?? {}).some(
          (entry) => !!carriedExitStatus(entry) && sources.has(entry?.sourceMatchUpId ?? ''),
        );
      if (!fromSource) continue;
      const { loserMatchUp, loserTargetDrawPosition } =
        positionTargets({
          matchUpId: feeder.matchUpId,
          inContextMatchUp: feeder,
          inContextDrawMatchUps,
          drawDefinition,
        })?.targetMatchUps ?? {};
      if (!loserMatchUp?.structureId || seats.has(loserMatchUp.matchUpId)) continue;
      const seat = assignments(loserMatchUp.structureId).find((a) => a.drawPosition === loserTargetDrawPosition);
      if (!seat?.bye || !seat.byeFromPropagation) continue;
      seats.set(loserMatchUp.matchUpId, loserMatchUp);
      sources.add(loserMatchUp.matchUpId);
      grown = true;
    }
  }
  return [...seats.values()];
}

/**
 * Does a loser seat whose feeder sends nobody show that with a BYE? CA ruling (A), 2026-10-21: yes, except that a double
 * exit's loser seat shows the exit it produced when `doubleExitPropagateBye` is false, whether the double exit was
 * entered or two exits converged into it, unless the seat is a fed-in position (`hasFedDrawPosition`), which takes a BYE
 * whatever the policy. Before the ruling a converged double exit's seat held a BYE or the produced exit depending on the
 * order the results were entered (`reclaimSingleExitBye` against the settled-seat rule of census S6 20694910).
 */
export function seatShowsBye({
  appliedPolicies,
  seatMatchUp,
  reason,
}: {
  appliedPolicies?: PolicyDefinitions;
  seatMatchUp?: HydratedMatchUp;
  reason?: FeederSendsNobody;
}): boolean {
  if (!reason) return false;
  if (reason !== 'DOUBLE_EXIT' || propagatesByeOnDoubleExit(appliedPolicies)) return true;
  return !!seatMatchUp?.hasFedDrawPosition;
}
