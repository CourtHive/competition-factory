import { progressExitStatus } from '@Mutate/matchUps/drawPositions/progressExitStatus';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getSideDrawPosition } from '@Query/matchUps/getDrawPositionSides';
import { clearDrawPosition } from '@Mutate/matchUps/drawPositions/positionClear';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { applyWithdrawnExits } from './applyWithdrawnExits';
import { isDoubleExit, isExit } from '@Validators/isExit';
import {
  clearSideExitProvenance,
  getSideExitProvenance,
  withdrawProducedExits,
  withdrawByeClaim,
  getExitSides,
} from './sideExitProvenance';

// constants and types
import type { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import { TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { MatchUpsMap, ResultType } from '@Types/factoryTypes';

type SettleArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  propagateExitStatus?: boolean;
  matchUpsMap?: MatchUpsMap;
  event?: Event;
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
    if (isDoubleExit(matchUp.matchUpStatus) || !isExit(matchUp.matchUpStatus)) continue;
    if (getExitSides({ matchUp }).length !== 1) continue;
    const settled = settleRederivedDoubleExit({ ...args, matchUpId: matchUp.matchUpId });
    if (settled?.error) return settled;
  }
  return undefined;
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
 *  3. reset it to undecided, the carrier left in place, as it was the moment the carrier arrived;
 *  4. replay the kept origin's carry, and carry on through every further loser link.
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
  const [keptSide] = getExitSides({ matchUp: stored });
  const keptEntry = getSideExitProvenance({ matchUp: stored })?.[keptSide];
  const origin = matchUpsMap.drawMatchUps.find((candidate) => candidate.matchUpId === keptEntry?.sourceMatchUpId);
  const inContext = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap }).matchUps?.find(
    (candidate) => candidate.matchUpId === matchUpId,
  );
  const carrierId = inContext?.sides?.find((side: any) => side?.sideNumber === keptSide)?.participantId;
  if (!stored || !origin || !carrierId) return undefined;

  // 1. what it produced downstream as a double exit
  const withdrawnExits = withdrawProducedExits({
    mappedMatchUps: matchUpsMap.mappedMatchUps,
    sourceMatchUpId: matchUpId,
    drawDefinition,
  });
  applyWithdrawnExits({ withdrawnExits, tournamentRecord, drawDefinition, matchUpsMap, event });

  // 2. the BYEs it claimed
  withdrawByeSeats({ claimantMatchUpId: matchUpId, tournamentRecord, drawDefinition, matchUpsMap, event });

  // 3. undecided, carrier in place
  clearSideExitProvenance(stored);
  stored.matchUpStatus = TO_BE_PLAYED;
  delete stored.winningSide;
  delete stored.sideStatusCodes;
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
    propagateExitStatus: propagateExitStatus ?? true,
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
export function carryExitOnward({ context, propagateExitStatus, tournamentRecord, drawDefinition, event }: any) {
  let current = context;
  for (let failsafe = 0; current?.loserMatchUp && failsafe < 10; failsafe += 1) {
    const progressResult: any = progressExitStatus({
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
    // a refused write is returned, never discarded: the caller's rollback restores the draw
    if (progressResult?.error) return progressResult;
    current = progressResult?.context?.loserMatchUp ? { ...current, ...progressResult.context } : undefined;
  }
  return undefined;
}

/** Withdraw a matchUp's BYE claims, clearing each propagated BYE seat no other claim still holds. */
function withdrawByeSeats({ claimantMatchUpId, tournamentRecord, drawDefinition, matchUpsMap, event }: any) {
  for (const [structureId, mapped] of Object.entries(matchUpsMap.mappedMatchUps ?? {}) as [string, any][]) {
    const structure = drawDefinition.structures?.find((candidate) => candidate.structureId === structureId);
    for (const matchUp of (mapped?.matchUps ?? []) as MatchUp[]) {
      for (const sideNumber of [1, 2]) {
        const claims = matchUp.sideExitProvenance?.[sideNumber]?.byeClaims ?? [];
        if (!claims.includes(claimantMatchUpId)) continue;
        withdrawByeClaim({ matchUp, sideNumber, claimantMatchUpId });
        if (matchUp.sideExitProvenance?.[sideNumber]?.byeClaims?.length) continue;
        const drawPosition = getSideDrawPosition({ drawDefinition, structureId, matchUp, sideNumber });
        const assignment = structure?.positionAssignments?.find((entry) => entry.drawPosition === drawPosition);
        if (!assignment?.bye || !(assignment as any).byeFromPropagation) continue;
        clearDrawPosition({ tournamentRecord, drawDefinition, structureId, drawPosition, matchUpsMap, event });
      }
    }
  }
}
