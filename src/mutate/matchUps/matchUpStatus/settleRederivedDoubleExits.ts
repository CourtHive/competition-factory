import { propagateUnfillableLoserBye } from '@Mutate/matchUps/drawPositions/propagateUnfillableLoserBye';
import { arrivedOverLoserLink } from '@Mutate/drawDefinitions/matchUpGovernor/removeDoubleExit';
import { progressExitStatus } from '@Mutate/matchUps/drawPositions/progressExitStatus';
import { clearDrawPosition } from '@Mutate/matchUps/drawPositions/positionClear';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { directWinner } from '@Mutate/matchUps/drawPositions/directWinner';
import { isAnyExit, isDoubleExit, isExit } from '@Validators/isExit';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { applyWithdrawnExits } from './applyWithdrawnExits';
import { withdrawByeSeats } from './withdrawByeSeats';
import {
  clearSideExitProvenance,
  getSideExitProvenance,
  withdrawProducedExits,
  carriedExitStatus,
  setSideExitProvenance,
  blankSideExitCode,
  blankExitCodes,
  getExitSides,
} from './sideExitProvenance';

// constants and types
import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import type {
  SideExitProvenanceEntry,
  MatchUpStatusUnion,
  DrawDefinition,
  Tournament,
  MatchUp,
  Event,
} from '@Types/tournamentTypes';

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
  if (!stored || !keptEntry || !origin) return undefined;
  if (!carrierSide) {
    // The kept origin is a DOUBLE EXIT: nothing was carried here, an exit was PRODUCED onto this matchUp, and the
    // participant who stands here (the withdrawn origin's relabelled loser) is simply present opposite it. The
    // re-derivation has already awarded it to them (RULE 2: the side without the exit wins); what a carry's replay
    // would do for a carrier, the forward path does for a winner: they go on. (F2, CA 2026-10-07; census w2 9100377,
    // MFIC 16/11 `Consolation|3|2`, which stood as a double exit until then, then stood won and unadvanced.)
    //
    // Only where someone stands here: two double exits producing into one empty matchUp (adjacent double walkovers in
    // Main R1, `exitStatusClearing` 2.3) re-derive to the kept produced exit, pending, as they always did; and a double
    // exit's exit carried here over its LOSER link has no carrier either and is left as re-derived.
    //
    // Over a LOSER link a double exit produces an exit only with `doubleExitPropagateBye: false` (otherwise a BYE).
    // Where somebody stands opposite it and has been awarded it, they go on as from any produced exit: forward play
    // advances them (census w2 9100572, MFIC 16/16 `Consolation|1|1`, policy off, where they stood won and unadvanced).
    const winnerStands = !!inContext?.sides?.some(
      (side) => side?.sideNumber === inContext.winningSide && side.participantId,
    );
    const overLoserLink =
      !!inContextMatchUps &&
      arrivedOverLoserLink({
        inContextDrawMatchUps: inContextMatchUps,
        targetMatchUpId: matchUpId,
        sourceMatchUpId: origin.matchUpId,
        drawDefinition,
      });
    const produced = isDoubleExit(origin.matchUpStatus) && !!inContextMatchUps && (winnerStands || !overLoserLink);
    // carried over a loser link with nobody standing opposite: nothing to replay or advance, but the exit still reads
    // as the kept double exit alone produced it, pending
    if (!produced && isDoubleExit(origin.matchUpStatus) && overLoserLink && !winnerStands) {
      // a double exit no longer, it claims no BYE further on; only its own loser target's is still owed (below)
      withdrawByeSeats({
        clearDrawPosition,
        keepAt: ownLoserTarget({ matchUpId, inContextMatchUps, drawDefinition }),
        claimantMatchUpId: matchUpId,
        tournamentRecord,
        drawDefinition,
        matchUpsMap,
        event,
      });
      settleProducedExit({
        stored,
        keptSide,
        keptEntry,
        winnerStands,
        matchUpsMap,
        tournamentRecord,
        drawDefinition,
        event,
      });
      return undefined;
    }
    if (!produced || !inContext || !inContextMatchUps) return undefined;
    // what it produced downstream as a double exit goes first, as for a carrier: the winner target still held the
    // pending exit this convergence produced, and a winner directed into it would have been awarded it on arrival
    const withdrawnExits = withdrawProducedExits({
      mappedMatchUps: matchUpsMap.mappedMatchUps,
      sourceMatchUpId: matchUpId,
      drawDefinition,
    });
    applyWithdrawnExits({ withdrawnExits, tournamentRecord, drawDefinition, matchUpsMap, event });
    // over a loser link the re-derived matchUp still produces no loser — its losing side is the produced exit — so the
    // BYE it claimed for its loser target is still owed, and stays (`correctionDivergence`, COMPASS/OLYMPIC, policy off).
    // Only that one: what its produced exit decided further on has just been withdrawn above, and a BYE claimed for the
    // loser of that goes with it (census run-17 baseline F3, COMPASS 16/14 20731395 and siblings, policy off:
    // `West|2|2`'s produced walkover went, and the BYE claimed in `Southwest|1|1` for its loser stood).
    const ownLoserTargetId = overLoserLink
      ? ownLoserTarget({ matchUpId, inContextMatchUps, drawDefinition })
      : undefined;
    withdrawByeSeats({
      clearDrawPosition,
      claimantMatchUpId: matchUpId,
      keepAt: ownLoserTargetId,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      event,
    });
    settleProducedExit({
      stored,
      keptSide,
      keptEntry,
      winnerStands,
      matchUpsMap,
      tournamentRecord,
      drawDefinition,
      event,
    });
    // ... and where the convergence had already given that BYE up, it is owed again: a double exit takes back the BYE its
    // single exit claimed (`reclaimSingleExitBye`), so when the convergence dissolves the seat is left empty, and the
    // re-derived single exit, whose losing side is the produced exit, can never send it a loser (census S8, COMPASS 8/8
    // policy-off 20853116: `South|1|1` dp 1 after `East|1|2` went from a walkover back to a played result).
    if (overLoserLink) {
      const owed = propagateUnfillableLoserBye({
        tournamentRecord,
        drawDefinition,
        matchUpsMap,
        matchUpId,
        event,
      });
      if (owed?.error) return owed;
    }
    return advanceStandingWinner({
      inContextDrawMatchUps: inContextMatchUps,
      tournamentRecord,
      drawDefinition,
      matchUpsMap,
      inContext,
      event,
    });
  }

  // 1. what it produced downstream as a double exit
  const withdrawnExits = withdrawProducedExits({
    mappedMatchUps: matchUpsMap.mappedMatchUps,
    sourceMatchUpId: matchUpId,
    drawDefinition,
  });
  applyWithdrawnExits({ withdrawnExits, tournamentRecord, drawDefinition, matchUpsMap, event });

  // 2. the BYEs it claimed
  withdrawByeSeats({
    clearDrawPosition,
    claimantMatchUpId: matchUpId,
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
    event,
  });

  // 3. as it was the moment the carrier arrived: undecided, or still a BYE where the lost origin's seat
  //    became one (census w2 9100488) — the carrier then passes through it, carrying the exit
  // The kept carrier's own entry stays: it is still true, and where the carrier reached this matchUp
  // through a BYE rather than as the origin's loser, the replay below has no other way to restore it
  // (sweep seed 6141627: a South final became a BYE, its kept entry was cleared and never re-stamped).
  // It is kept at the carrier's CURRENT side, where the replay stamps it too, never at its old key.
  clearSideExitProvenance(stored);
  setSideExitProvenance({ provenance: { [carrierSide]: { ...keptEntry } }, matchUp: stored });
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

  // 4. the kept origin's carry, replayed, and onward through every further loser link — unless the carrier has already
  //    carried it past this BYE into a matchUp it decided, where a replay would meet the carry as a second exit
  if (stored.matchUpStatus === BYE && carriedOnAlready({ inContextMatchUps, inContext, carrierId, origin }))
    return undefined;
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
 * Whether the carrier already stands a round on past this BYE matchUp, in a matchUp their carry decided: its side holding
 * them records the exit carried from `origin`, and the matchUp is an exit. A carrier passing a BYE that arrives in the
 * cascade itself is carried there at once (`stampCarriedExitOnArrival`); replaying the carry from the BYE matchUp then
 * met it as an exit already standing and converged the two into a double exit (census run 17 F3, OLYMPIC 16/16 seed
 * 20738091, `South|2|1`, reached once a displaced carrier's exit no longer stood on the BYE matchUp beside it).
 */
function carriedOnAlready({
  inContextMatchUps,
  inContext,
  carrierId,
  origin,
}: {
  inContextMatchUps?: HydratedMatchUp[];
  inContext?: HydratedMatchUp;
  carrierId?: string;
  origin: MatchUp;
}): boolean {
  if (!carrierId || !inContext) return false;
  return !!inContextMatchUps?.some((matchUp) => {
    if (matchUp.structureId !== inContext.structureId) return false;
    if ((matchUp.roundNumber ?? 0) <= (inContext.roundNumber ?? 0) || !isAnyExit(matchUp.matchUpStatus)) return false;
    const side = matchUp.sides?.find((candidate) => candidate?.participantId === carrierId)?.sideNumber;
    const entry = side ? getSideExitProvenance({ matchUp })?.[side as 1 | 2] : undefined;
    return !!carriedExitStatus(entry) && entry?.sourceMatchUpId === origin.matchUpId;
  });
}

/**
 * A re-derived produced exit reads as the kept double exit alone would have produced it. The withdrawn side's code goes
 * with its exit, the kept side's stays (`aWithdrawnExitTakesItsCode`). And a produced exit RELAYED PAST A BYE, with
 * nobody standing on the side it would be awarded to, lands PENDING until somebody arrives (CA 2026-10-03, Q3), as on
 * the direct path; one that arrived straight down its link keeps the award to the seat that will receive the next
 * arrival (`exitStatusClearing` 2.3, CA 2026-09-19). Left as the re-derivation wrote it, a relabel to a played result
 * kept the converged codes on the winner's side and awarded a relayed exit to an empty seat: census policy-off 20466254
 * (COMPASS 32/27, `South|3|1`) and 20488568 (OLYMPIC 32/29, `South|2|1`), and the codes alone in 20520641
 * (CURTIS_CONSOLATION 16/11, `Consolation 1|3|1`); each an exit code on the winning side.
 */
function settleProducedExit({
  tournamentRecord,
  drawDefinition,
  winnerStands,
  matchUpsMap,
  keptEntry,
  keptSide,
  stored,
  event,
}: {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  keptEntry: SideExitProvenanceEntry;
  matchUpsMap: MatchUpsMap;
  winnerStands: boolean;
  keptSide: number;
  stored: MatchUp;
  event?: Event;
}): void {
  blankSideExitCode(stored, 3 - keptSide);
  if (!winnerStands && relayedPastBye({ stored, keptEntry, drawMatchUps: matchUpsMap.drawMatchUps })) {
    delete stored.winningSide;
  }
  modifyMatchUpNotice({
    tournamentId: tournamentRecord?.tournamentId,
    context: 'settleRederivedDoubleExit',
    eventId: event?.eventId,
    matchUp: stored,
    drawDefinition,
    event,
  });
}

/** the matchUp this one's loser link feeds, whose BYE a produced exit's empty losing side still owes */
function ownLoserTarget({
  inContextMatchUps,
  drawDefinition,
  matchUpId,
}: {
  inContextMatchUps?: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  matchUpId: string;
}): string | undefined {
  if (!inContextMatchUps) return undefined;
  return positionTargets({ matchUpId, inContextDrawMatchUps: inContextMatchUps, drawDefinition }).targetMatchUps
    ?.loserMatchUp?.matchUpId;
}

/** a BYE feeding this matchUp holds the kept exit's origin: the exit reached here relayed past it, not down its link */
function relayedPastBye({
  drawMatchUps,
  keptEntry,
  stored,
}: {
  keptEntry: SideExitProvenanceEntry;
  drawMatchUps: MatchUp[];
  stored: MatchUp;
}): boolean {
  return drawMatchUps.some(
    (feeder) =>
      feeder.winnerMatchUpId === stored.matchUpId &&
      feeder.matchUpStatus === BYE &&
      Object.values(getSideExitProvenance({ matchUp: feeder }) ?? {}).some(
        (entry) => entry?.sourceMatchUpId === keptEntry.sourceMatchUpId,
      ),
  );
}

/**
 * The participant who stands in a re-derived produced exit and has been awarded it goes on, exactly as a winner is
 * directed from any decided matchUp (`directWinner`): nothing is written here that the award did not already decide.
 * Nobody to advance, or already standing in the winner target: nothing to do.
 */
function advanceStandingWinner({
  inContextDrawMatchUps,
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  inContext,
  event,
}: SettleArgs & { inContextDrawMatchUps: HydratedMatchUp[]; matchUpsMap: MatchUpsMap; inContext: HydratedMatchUp }):
  ResultType | undefined {
  const winner = inContext.sides?.find((side) => side?.sideNumber === inContext.winningSide && side.participantId);
  if (!winner?.drawPosition) return undefined;
  const targetData = positionTargets({ matchUpId: inContext.matchUpId, inContextDrawMatchUps, drawDefinition });
  if (targetData.error) return targetData;
  const winnerMatchUp = targetData.targetMatchUps?.winnerMatchUp;
  if (!winnerMatchUp || winnerMatchUp.sides?.some((side) => side?.participantId === winner.participantId))
    return undefined;
  return directWinner({
    winnerMatchUpDrawPositionIndex: targetData.targetMatchUps?.winnerMatchUpDrawPositionIndex,
    winnerTargetLink: targetData.targetLinks?.winnerTargetLink,
    sourceMatchUpStatus: inContext.matchUpStatus,
    winningDrawPosition: winner.drawPosition,
    sourceMatchUpId: inContext.matchUpId,
    projectedWinningSide: undefined,
    dualMatchUp: undefined,
    inContextDrawMatchUps,
    tournamentRecord,
    drawDefinition,
    winnerMatchUp,
    matchUpsMap,
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
