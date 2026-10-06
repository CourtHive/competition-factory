import { progressExitStatus } from '@Mutate/matchUps/drawPositions/progressExitStatus';
import { clearDrawPosition } from '@Mutate/matchUps/drawPositions/positionClear';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { isAnyExit, isDoubleExit, isExit } from '@Validators/isExit';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionAssignmentsOf } from '@Acquire/structureMembers';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { applyWithdrawnExits } from './applyWithdrawnExits';
import {
  clearSideExitProvenance,
  getSideExitProvenance,
  withdrawProducedExits,
  setSideExitProvenance,
  withdrawByeClaim,
  blankExitCodes,
  getExitSides,
} from './sideExitProvenance';

// constants and types
import type { DrawDefinition, Event, MatchUp, MatchUpStatusUnion, Tournament } from '@Types/tournamentTypes';
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { MatchUpsMap, ResultType } from '@Types/factoryTypes';

type SettleArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  propagateExitStatus?: boolean;
  matchUpsMap?: MatchUpsMap;
  event?: Event;
};

/** What `carryExitOnward` carries from one loser matchUp to the next. */
type CarriedExit = {
  sourceMatchUpStatus?: MatchUpStatusUnion;
  sourceMatchUpStatusCodes?: string[];
  loserParticipantId?: string;
  matchUpsMap?: MatchUpsMap;
  sourceWinningSide?: number;
  sourceMatchUpId?: string;
  loserMatchUp?: MatchUp;
};

/**
 * Settle every matchUp that was a double exit when this call began and has since RE-DERIVED to a single
 * carried exit — the shape a convergence takes when one of its two origins is taken back (CA,
 * 2026-10-03: clearing either origin of a converged double exit cannot be refused while nothing
 * downstream is active), whichever correction took it back: a clear of the origin, a relabel of it
 * (F2), or a re-score.
 *
 * Asked once, at the end of `setMatchUpStatus`, of the stored draw, like `reconcileStaleExitOrigins`:
 * it needs no record of which writer re-derived the matchUp, so a writer added later is covered too.
 * The matchUp the call itself targeted is not settled here; its own write decided it.
 */
export function settleRederivedDoubleExits({
  doubleExitsBefore,
  targetMatchUpId,
  ...args
}: SettleArgs & { doubleExitsBefore: Set<string>; targetMatchUpId?: string }): ResultType | undefined {
  if (!doubleExitsBefore.size) return undefined;
  const { drawMatchUps } = getMatchUpsMap({ drawDefinition: args.drawDefinition });
  for (const matchUp of drawMatchUps) {
    if (matchUp.matchUpId === targetMatchUpId || !doubleExitsBefore.has(matchUp.matchUpId)) continue;
    // re-derived to a single exit, or — when the lost origin's seat became a BYE — to a BYE
    if (isDoubleExit(matchUp.matchUpStatus)) continue;
    if (!isExit(matchUp.matchUpStatus) && matchUp.matchUpStatus !== BYE) continue;
    if (liveExitSides({ matchUp, drawMatchUps }).length !== 1) continue;
    const settled = settleRederivedDoubleExit({ ...args, matchUpId: matchUp.matchUpId });
    if (settled?.error) return settled;
  }
  return undefined;
}

/**
 * The sides whose carried exit is still TRUE: the origin it names is still an exit. When the lost
 * origin is withdrawn its entry goes with it; when the lost origin's seat becomes a BYE instead (census
 * w2 9100488: a double exit upstream turned `South|1|4` into a BYE), its entry stays behind and names
 * an origin that no longer exits — so the count is of origins, not of entries.
 */
function liveExitSides({ matchUp, drawMatchUps }: { matchUp?: MatchUp; drawMatchUps: MatchUp[] }): number[] {
  const provenance = getSideExitProvenance({ matchUp });
  return getExitSides({ matchUp }).filter((sideNumber) => {
    const origin = drawMatchUps.find((candidate) => candidate.matchUpId === provenance?.[sideNumber]?.sourceMatchUpId);
    return isAnyExit(origin?.matchUpStatus);
  });
}

/**
 * Put a converged matchUp that has lost one of its two origins where the KEPT origin alone puts it.
 *
 * Re-deriving its status from the surviving provenance is not enough. As a double exit it PRODUCED
 * things: an exit a round further on, and — under `doubleExitPropagateBye`, the default — BYEs in the
 * seats its loser would have taken. As a single carried exit it produces none of them; instead its
 * carrier loses it and is directed onward carrying the exit. So the matchUp is unwound completely and
 * the kept origin's carry is REPLAYED into it through `progressExitStatus`, the forward path itself, so
 * the result is the kept origin's draw by construction rather than by inference:
 *
 *  1. withdraw the exits this matchUp produced downstream, identity-keyed, as any undo does;
 *  2. withdraw its BYE claims, and clear each BYE seat it was the last to claim (`byeFromPropagation`
 *     only: a BYE the draw was generated with is never touched);
 *  3. reset it to undecided, the carrier left in place, as it was the moment the carrier arrived — or
 *     leave it a BYE where the lost origin's seat became one, the carrier then passing through it;
 *  4. replay the kept origin's carry (RULE 1 carries it past a BYE), and on through every loser link.
 *
 * Exported for the relabel route (F2), which withdraws one origin of a convergence the same way.
 */
export function settleRederivedDoubleExit({
  tournamentRecord,
  propagateExitStatus,
  drawDefinition,
  matchUpId,
  event,
}: SettleArgs & { matchUpId: string }): ResultType | undefined {
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const stored = matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === matchUpId);
  const [keptSide] = liveExitSides({ matchUp: stored, drawMatchUps: matchUpsMap.drawMatchUps });
  const keptEntry = getSideExitProvenance({ matchUp: stored })?.[keptSide];
  const origin = matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === keptEntry?.sourceMatchUpId);
  // The carrier is the kept origin's LOSER, wherever it sits now. Not the participant at `keptSide`: a
  // provenance key is the side the exit ARRIVED at, and sides re-sort by drawPosition once an opponent
  // arrives (census de 9300879: the carrier arrived on side 2 at drawPosition 3, the opponent then took
  // drawPosition 4, and the side-2 read replayed the walkover with the OPPONENT as its carrier).
  // A double-exit origin has no winningSide and so no carrier: its produced exit is pending, not carried.
  const inContextMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap }).matchUps;
  const originInContext = inContextMatchUps?.find((candidate) => candidate.matchUpId === origin?.matchUpId);
  const carrierId = originInContext?.winningSide
    ? originInContext.sides?.find((side) => side.sideNumber !== originInContext.winningSide)?.participantId
    : undefined;
  const inContext = inContextMatchUps?.find((candidate) => candidate.matchUpId === matchUpId);
  const carrierSide = inContext?.sides?.find((side) => carrierId && side.participantId === carrierId)?.sideNumber;
  if (!stored || !keptEntry || !origin || !carrierSide) return undefined;

  // 1. what it produced downstream as a double exit
  const withdrawnExits = withdrawProducedExits({
    mappedMatchUps: matchUpsMap.mappedMatchUps,
    sourceMatchUpId: matchUpId,
    drawDefinition,
  });
  applyWithdrawnExits({ withdrawnExits, tournamentRecord, drawDefinition, matchUpsMap, event });

  // 2. the BYEs it claimed
  withdrawByeSeats({ claimantMatchUpId: matchUpId, tournamentRecord, drawDefinition, matchUpsMap, event });

  // 3. as it was the moment the carrier arrived: undecided, or still a BYE where the lost origin's seat
  //    became one (census w2 9100488) — the carrier then passes through it, carrying the exit
  // The kept carrier's own entry stays: it is still true, and where the carrier reached this matchUp
  // through a BYE rather than as the origin's loser, the replay below has no other way to restore it
  // (sweep seed 6141627: a South final became a BYE, its kept entry was cleared and never re-stamped).
  // It is kept at the carrier's CURRENT side, where the replay stamps it too, never at its old key.
  clearSideExitProvenance(stored);
  setSideExitProvenance({ provenance: { [carrierSide]: keptEntry }, matchUp: stored });
  if (stored.matchUpStatus !== BYE) stored.matchUpStatus = TO_BE_PLAYED;
  delete stored.winningSide;
  blankExitCodes(stored);
  modifyMatchUpNotice({
    tournamentId: tournamentRecord?.tournamentId,
    context: 'settleRederivedDoubleExit',
    eventId: event?.eventId,
    matchUp: stored,
    drawDefinition,
    event,
  });

  // 4. the kept origin's carry, replayed, and onward through every further loser link
  return carryExitOnward({
    context: {
      // the origin's reason is read from its own `sideStatusCodes` by `progressExitStatus`; the legacy
      // positional array is not this function's to read (P37, `verify:exit-tenant`)
      sourceMatchUpStatusCodes: [],
      sourceMatchUpStatus: origin.matchUpStatus,
      sourceWinningSide: origin.winningSide,
      sourceMatchUpId: origin.matchUpId,
      loserParticipantId: carrierId,
      loserMatchUp: stored,
      matchUpsMap,
    },
    propagateExitStatus,
    tournamentRecord,
    drawDefinition,
    event,
  });
}

/**
 * The exit-carrying loop `setMatchUpStatus` runs after a direction: set the loser's matchUp from the
 * carried exit, and keep going while that produces a further loser (COMPASS: East → West → South →
 * Southeast). Bounded, as there.
 */
export function carryExitOnward({
  context,
  propagateExitStatus,
  tournamentRecord,
  drawDefinition,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  propagateExitStatus?: boolean;
  context?: CarriedExit;
  event?: Event;
}): ResultType | undefined {
  let current: CarriedExit | undefined = context;
  for (let failsafe = 0; current?.loserMatchUp && failsafe < 10; failsafe += 1) {
    const progressResult = progressExitStatus({
      sourceMatchUpStatusCodes: current.sourceMatchUpStatusCodes,
      sourceMatchUpStatus: current.sourceMatchUpStatus,
      sourceWinningSide: current.sourceWinningSide,
      loserParticipantId: current.loserParticipantId,
      sourceMatchUpId: current.sourceMatchUpId,
      loserMatchUp: current.loserMatchUp,
      matchUpsMap: current.matchUpsMap,
      propagateExitStatus,
      tournamentRecord,
      drawDefinition,
      event,
    });
    // a refused write is returned, never dropped, exactly as `setMatchUpStatus`'s own loop returns it (F3)
    if (progressResult?.error) return progressResult;
    current = progressResult?.context?.loserMatchUp ? { ...current, ...progressResult.context } : undefined;
  }
  return undefined;
}

/** Withdraw a matchUp's BYE claims, clearing each propagated BYE seat no other claim still holds. */
function withdrawByeSeats({
  claimantMatchUpId,
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  claimantMatchUpId: string;
  event?: Event;
}) {
  for (const [structureId, mapped] of Object.entries(matchUpsMap.mappedMatchUps)) {
    const structure = drawDefinition.structures?.find((candidate) => candidate.structureId === structureId);
    for (const matchUp of mapped.matchUps as MatchUp[]) {
      for (const sideNumber of [1, 2]) {
        const claims = matchUp.sideExitProvenance?.[sideNumber]?.byeClaims ?? [];
        if (!claims.includes(claimantMatchUpId)) continue;
        withdrawByeClaim({ matchUp, sideNumber, claimantMatchUpId });
        if (matchUp.sideExitProvenance?.[sideNumber]?.byeClaims?.length) continue;
        const drawPosition = getSideDrawPosition({ drawDefinition, structureId, matchUp, sideNumber });
        const assignment = positionAssignmentsOf(structure)?.find((entry) => entry.drawPosition === drawPosition);
        if (!assignment?.bye || !assignment.byeFromPropagation) continue;
        clearDrawPosition({ tournamentRecord, drawDefinition, structureId, drawPosition, matchUpsMap, event });
      }
    }
  }
}
