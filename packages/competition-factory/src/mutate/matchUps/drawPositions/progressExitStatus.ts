import { assignMatchUpDrawPosition, directWinner } from '@Mutate/matchUps/drawPositions/drawPositionPlacement';
import { getSideExitProvenance, carriedExitStatus } from '@Helpers/drawTopology/sideExitProvenance';
import { getSideStatusCode } from '@Mutate/matchUps/matchUpStatus/sideStatusCodes';
import { setMatchUpState } from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import { getTargetsDownstream } from '@Query/drawDefinition/isActiveDownstream';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { decorateResult } from '@Functions/global/decorateResult';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { isAnyExit, isExit } from '@Validators/isExit';
import {
  buildCarriedExitProvenance,
  collapseDoubleExitStatus,
  mergeSideExitProvenance,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants and types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { MISSING_MATCHUP } from '@Constants/errorConditionConstants';
import type { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import { SUCCESS } from '@Constants/resultConstants';

// After a participant advances through a BYE, find the matchUp they advanced
// into — the nearest later round in the same structure that now holds them — so
// the exit status can be re-propagated onto it.
/**
 * Where a carrier who passed a BYE now stands: the nearest later round of the holder's own structure that holds them,
 * else the matchUp the holder's own winner edge leads to in ANOTHER structure, when they are seated there.
 *
 * A structure's last round has nowhere further in its own structure, but a link can take its winner on. In
 * DOUBLE_ELIMINATION the Backdraw final's winner goes on into the grand final. A participant who lost the Main
 * structure's final by walkover and dropped into a Backdraw final holding a BYE passes the BYE across that link, and
 * the walkover goes with them: the grand final is a WALKOVER won by the opponent (census
 * 9304724, DOUBLE_ELIMINATION 8/6). Searching the holder's structure alone stopped the carry at the BYE, and the grand
 * final stood TO_BE_PLAYED.
 */
function findAdvancementMatchUp(inContextMatchUps, currentMatchUp, participantId) {
  const holds = (m) => m.sides?.some((s) => s.participantId === participantId);
  const later = inContextMatchUps
    ?.filter(
      (m) =>
        m.matchUpId !== currentMatchUp.matchUpId &&
        m.structureId === currentMatchUp.structureId &&
        m.roundNumber > currentMatchUp.roundNumber &&
        holds(m),
    )
    .sort((a, b) => a.roundNumber - b.roundNumber)[0];
  if (later) return later;
  const onward = currentMatchUp.winnerMatchUpId
    ? inContextMatchUps?.find((m) => m.matchUpId === currentMatchUp.winnerMatchUpId)
    : undefined;
  return onward && onward.structureId !== currentMatchUp.structureId && holds(onward) ? onward : undefined;
}

export function progressExitStatus({
  propagateExitStatus,
  sourceMatchUpStatus,
  loserParticipantId,
  sourceWinningSide,
  sourceMatchUpId,
  tournamentRecord,
  drawDefinition,
  loserMatchUp,
  matchUpsMap,
  event,
}) {
  const stack = 'progressExitStatus';

  pushGlobalLog({
    method: stack,
    newline: true,
    color: 'magenta',
    keyColors: { loserMatchUpId: 'brightcyan', sourceMatchUpStatus: 'brightyellow' },
    loserMatchUpId: loserMatchUp?.matchUpId,
    loserMatchUpStatus: loserMatchUp?.matchUpStatus,
    sourceMatchUpStatus,
    loserParticipantId: loserParticipantId?.slice(0, 8),
    propagateExitStatus,
  });

  // RETIRED should not be propagated as an exit status
  const carryOverMatchUpStatus =
    (isExit(sourceMatchUpStatus) && sourceMatchUpStatus !== RETIRED && sourceMatchUpStatus) || WALKOVER;

  // get the updated inContext matchUps so we have current sides/positions
  // (the participant has already been fed/advanced by directLoser at this point)
  /**
   * HYDRATED, as `setMatchUpState`'s view is. The downstream walk asks whether a match was PLAYED from
   * `side.participant`, which only a view built with the tournament record carries; without it every side reads
   * empty and a recorded result below reads as inert. Census s16 COMPASS 20599089 (F2): `carryPastDecidedMatchUp`
   * read nothing active below `West|1|7` on this view and declined to carry, and the convergence it fell through to
   * was refused by `setMatchUpState`, which saw the result recorded below — after the arrival had been written.
   */
  const inContextMatchUps = getAllDrawMatchUps({
    inContext: true,
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
    event,
  })?.matchUps;
  const updatedLoserMatchUp = inContextMatchUps?.find((m) => m.matchUpId === loserMatchUp?.matchUpId);
  const sourceMatchUp = inContextMatchUps?.find((m) => m.matchUpId === sourceMatchUpId);

  if (!updatedLoserMatchUp?.matchUpId) {
    return decorateResult({ result: { error: MISSING_MATCHUP }, stack });
  }

  const targetProvenance = getSideExitProvenance({ matchUp: updatedLoserMatchUp });
  const loserParticipantSide = updatedLoserMatchUp.sides?.find((s) => s.participantId === loserParticipantId);

  let loserMatchUpStatus = carryOverMatchUpStatus;
  let winningSide: number | undefined = undefined;
  // the side the carried exit arrives at, and the reason it brings — recorded after the state write
  let carriedReasonSide: number | undefined = undefined;
  let carriedReason: string | undefined = undefined;
  // CODES first-class: the side that EXITED, attributed to the matchUp whose result produced the
  // exit. Written alongside the legacy string codes, exactly as doubleExitAdvancement does — see
  // sideExitProvenance.ts on why the legacy write is not yet gated.
  let exitProvenance;

  if (loserParticipantSide?.sideNumber) {
    const opponentSideNumber = loserParticipantSide.sideNumber === 1 ? 2 : 1;
    const opponentIsBye = updatedLoserMatchUp.sides?.find((s) => s.sideNumber === opponentSideNumber)?.bye;
    const participantsCount =
      updatedLoserMatchUp.sides?.reduce((count, s) => (s?.participantId ? count + 1 : count), 0) ?? 0;
    /**
     * THE SOURCE'S REASON, READ AT THE SIDE THAT EXITED. The reason the arriving side carries is the source's own
     * `sideStatusCodes`, keyed by side, which the scoring call wrote. Only that: a bare outcome code is not a
     * reason anybody gave.
     */
    const sourceExitingSide = sourceWinningSide ? 3 - sourceWinningSide : 1;
    const sourceReason = getSideStatusCode({ matchUp: sourceMatchUp, sideNumber: sourceExitingSide });
    carriedReasonSide = loserParticipantSide.sideNumber;
    carriedReason = sourceReason;

    /**
     * A CARRY PAST A BYE IS RECORDED BESIDE THE BYE, in every round (measured 2026-10-17).
     *
     * RULE 1 re-propagates the exit onto wherever the carrier lands. In a structure's last round there is nowhere
     * further, and nothing was written: the BYE matchUp kept no entry for the exit its carrier held. A BYE placed by a
     * double exit is withdrawn when that double exit is re-scored, and the carrier was then left as an ordinary
     * participant who could be played (census 20318646, COMPASS 8/8: Zoe's DEFAULTED met a BYE in the South final,
     * the BYE went, `South|1|1` was played, which made `West|1|2`'s downstream active and refused the convergence a
     * later walkover brought there — after the direction had written — stranding its winner).
     *
     * Recorded as the BYE's own carried entry, the shape `reconcileCarriesPastByes` and `writeCarryPastLateBye`
     * already read on a BYE matchUp: the matchUp stays a BYE while the BYE stands, and when it is withdrawn what is
     * retained re-derives it to the exit the carrier holds (RULE 2: the side without the exit wins).
     *
     * It is recorded before an earlier round's BYE too, not only the last round's. When the carrier is seated first and
     * the BYE arrives after them, their entry is already on the matchUp and is kept (`stampCarriedExitOnArrival`).
     * Writing it only in the last round when the BYE came first meant the same results, entered in the two orders,
     * left two draws (census A1 cases 11 and 17, COMPASS 32: `Southwest|1|2` and `Southeast|1|1` kept the entry in
     * one order and lost it in the other). The opposite normalisation was built and measured: withdraw the entry at
     * settle once the carry is recorded where the carrier landed. It broke five tests in the exitPropagation folder
     * against none for this one. A pull-back reads the BYE matchUp's copy to find the carry it takes home
     * (`aRelabelWithdrawsTheCarryFromEveryByeHeldMatchUp`), and a pinned shape records it there
     * (`anEmptyPositionResolvesNothing`). A copy whose carrier has since been replaced by a BYE is not a held exit
     * (`getHeldExit`).
     */
    const recordCarryBesideBye = () => {
      const stored = getMatchUpsMap({ drawDefinition })?.drawMatchUps?.find(
        (m) => m.matchUpId === loserMatchUp.matchUpId,
      );
      const recorded = mergeSideExitProvenance({
        provenance: buildCarriedExitProvenance({
          exitingSideNumber: loserParticipantSide.sideNumber,
          previousMatchUpStatus: sourceMatchUpStatus,
          matchUpStatus: carryOverMatchUpStatus,
          sourceMatchUpId,
        }),
        matchUp: stored,
      });
      // The BYE matchUp's state is not rewritten (it stays a BYE), so no state write announces it: the entry is
      // announced here, or a notice-driven save (a server projection, an embedding client) never sees it.
      if (recorded && stored)
        modifyMatchUpNotice({
          tournamentId: tournamentRecord?.tournamentId,
          eventId: event?.eventId,
          context: stack,
          matchUp: stored,
          drawDefinition,
          event,
        });
    };

    // RULE 1 — opponent is a BYE: the participant advances through it (the BYE
    // cascade has already moved them forward), so this matchUp stays a BYE, records
    // the carry beside the BYE, and we re-propagate the exit onto wherever the
    // participant landed. NOT a WALKOVER.
    if (opponentIsBye) {
      const advancementMatchUp = findAdvancementMatchUp(inContextMatchUps, updatedLoserMatchUp, loserParticipantId);
      pushGlobalLog({
        method: stack,
        color: 'brightcyan',
        decision: 'BYE_advance_rePropagate',
        from: updatedLoserMatchUp.matchUpId?.slice(0, 8),
        to: advancementMatchUp?.matchUpId?.slice(0, 8) ?? 'none',
      });
      recordCarryBesideBye();
      const context = advancementMatchUp
        ? { progressExitStatus: true, loserMatchUp: advancementMatchUp, loserParticipantId }
        : { progressExitStatus: true };
      return decorateResult({ result: { ...SUCCESS }, stack, context });
    }

    // RULES 2, 3 and 4 all describe the same fact about this side — it holds a participant who
    // EXITED upstream — so the provenance is built once. RULE 4 additionally leaves the opponent's
    // entry, stamped by the earlier propagation, untouched: the write below merges rather than
    // replaces.
    exitProvenance = buildCarriedExitProvenance({
      exitingSideNumber: loserParticipantSide.sideNumber,
      previousMatchUpStatus: sourceMatchUpStatus,
      matchUpStatus: carryOverMatchUpStatus,
      sourceMatchUpId,
    });

    // HAS THE OPPONENT ITSELF EXITED? That is RULE 4's question, and it was asked as
    // `isExit(loserMatchUp.matchUpStatus)` — two errors in one expression, each of which alone sends
    // a convergence to RULE 2.
    //
    //  - `loserMatchUp` is the STALE object. `updatedLoserMatchUp` is read at the top of this
    //    function precisely because the stale one predates `directLoser`; it also predates the
    //    UNWIND when a feeder is being re-scored, so it still reads `DOUBLE_DEFAULT` where the
    //    matchUp now holds the single exit its surviving origin derives.
    //  - `isExit` EXCLUDES `DOUBLE_WALKOVER` and `DOUBLE_DEFAULT` — exactly the statuses a
    //    convergence produces — so a third arrival at an already-converged matchUp read as "the
    //    opponent has not exited". See `isExit`'s own doc comment, which names this trap.
    //
    // Instrumented before it was changed: on the three-step FMLC reproduction the stale object read
    // `DOUBLE_DEFAULT` while the fresh one read `DEFAULTED`, and the gate took RULE 2.
    //
    // A stronger form — asking the OPPONENT SIDE's provenance rather than the matchUp's status —
    // was built and measured, and it is NOT taken: it also re-routes convergences this rule has
    // nothing to do with, and opened census seed 9303124 (DOUBLE_ELIMINATION 8/8) as an
    // `ERR_EXISTING_POSITION_ASSIGNMENT` returned over an already-mutated draw. Reading the right
    // object with the right predicate is the whole correction.
    /**
     * THE OPPONENT'S OWN EXIT, read from side-keyed provenance rather than from the LEGACY array's
     * LENGTH.
     *
     * This was `statusCodes.length === 0` — "no exit code is recorded anywhere on this matchUp" — used as
     * a proxy for "the opponent slot is empty or pending". It is the single gate that decides between
     * RULE 2/3 and RULE 4 below, and RULE 4 is the only site that COLLAPSES a convergence.
     *
     * It is also the reason the exit tenant could not leave `matchUpStatusCodes`. Traced on
     * `FIRST_MATCH_LOSER_CONSOLATION` 8/8 `nonRandom: 9000230` (the `doubleExitUnwindRederives` control
     * route): with the projection removed, `statusCodes` is empty, `opponentEmpty` flips TRUE, RULE 2 is
     * taken instead of RULE 4, `collapseDoubleExitStatus` is never called, and `Consolation|1|1` settles
     * `DEFAULTED` where `DOUBLE_DEFAULT` belongs — with BOTH provenance entries present and correct the
     * whole time. The facts were there; only this gate could not see them.
     *
     * Provenance answers the question the rule actually asks, and answers it PER SIDE, which an array
     * length cannot: has the OPPONENT already exited? `carriedExitStatus` is the same reader RULE 4's own
     * collapse and `deriveExitStateFromProvenance` use, so the two agree by construction.
     */
    const opponentProvenance = targetProvenance?.[opponentSideNumber];
    const opponentEmpty = participantsCount === 1 && !carriedExitStatus(opponentProvenance);
    if (opponentEmpty || !isAnyExit(updatedLoserMatchUp.matchUpStatus)) {
      // RULE 2 — opponent slot empty/pending: WALKOVER, the side WITHOUT the exit
      //          (the empty side that will receive the eventual opponent) wins.
      // RULE 3 — opponent is a present, non-exited participant: WALKOVER to them.
      // Both resolve identically: the non-exit (opponent) side is the winner and
      // the carried reason sits on the exiting participant's side.
      winningSide = opponentSideNumber;
    } else {
      // RULE 4, CARRIED PAST: see `carryPastDecidedMatchUp`
      const carried = carryPastDecidedMatchUp({
        arrivingSideNumber: loserParticipantSide.sideNumber,
        matchUp: updatedLoserMatchUp,
        inContextMatchUps,
        loserParticipantId,
        tournamentRecord,
        drawDefinition,
        matchUpsMap,
        event,
      });
      if (carried) return carried;

      // RULE 4 — the opponent has itself already exited: the two exits MEET and this matchUp
      // becomes a double exit. Nobody wins it. The carried reason goes to the ARRIVING participant's side,
      // and the opponent's reason stays where the earlier propagation put it.
      // WHICH double exit is derived from what each side carried, not hardcoded. This always wrote
      // DOUBLE_WALKOVER, which relabelled a default-on-default convergence as a walkover and so
      // propagated a WALKOVER where a DEFAULTED belonged. A mixture still collapses to
      // DOUBLE_WALKOVER — see collapseDoubleExitStatus for why the weaker claim wins there.
      loserMatchUpStatus = collapseDoubleExitStatus([carryOverMatchUpStatus, updatedLoserMatchUp.matchUpStatus]);
      winningSide = undefined;
    }
  }

  pushGlobalLog({
    method: stack,
    color: 'brightmagenta',
    action: 'calling_setMatchUpState',
    loserMatchUpId: loserMatchUp.matchUpId,
    finalStatus: loserMatchUpStatus,
    finalWinningSide: winningSide,
  });

  /**
   * THE REASON RIDES WITH THE SIDE INTO THE CONNECTED STRUCTURE.
   *
   * The reasons this write keeps are the target's own, plus the source's real reason recorded on the side the
   * exit actually arrived at. The other side may already carry its own reason from an earlier propagation, which
   * is RULE 4's convergence, and it is retained.
   */
  const retainedStatusCodes = {
    sideStatusCodes: carriedReasonSide && carriedReason ? { [carriedReasonSide]: carriedReason } : undefined,
    matchUpId: loserMatchUp.matchUpId,
  };

  const result = setMatchUpState({
    matchUpStatus: loserMatchUpStatus,
    matchUpId: loserMatchUp.matchUpId,
    allowChangePropagation: true,
    retainedStatusCodes,
    // THE CASCADE IDENTIFIES ITSELF. `checkParticipants` waives the two-participant requirement for
    // a one-sided exit, and until now it waived it on `propagateExitStatus` — a REQUEST FLAG any
    // caller can set — so a directly-entered WALKOVER could be awarded to an empty side and was.
    // This is the only propagation caller of `setMatchUpState`, so the waiver belongs to it by name.
    // RULE 2 above is why the waiver has to exist at all: the side WITHOUT the exit wins, and that
    // side is empty until the opponent arrives.
    propagatingExit: true,
    propagateExitStatus,
    tournamentRecord,
    drawDefinition,
    winningSide,
    event,
  });
  if (!result.error) {
    // stamped AFTER the state write: setMatchUpState clears provenance wherever it blanks the codes
    // the provenance describes (#4816), so writing first would be undone.
    // The map is rebuilt here rather than reusing the `matchUpsMap` threaded through the
    // propagation context. Measured — stamping onto the context map wrote to an object no
    // subsequent read could see: `decorateResult` deep-copied every context until 2026-10-11
    // (census F2), so that map held copies. Contexts now carry the live map; the stamp still
    // reads the draw, which is what it writes to.
    const drawMatchUps = getMatchUpsMap({ drawDefinition })?.drawMatchUps ?? [];
    const noContextLoserMatchUp = drawMatchUps.find((m) => m.matchUpId === loserMatchUp.matchUpId);
    mergeSideExitProvenance({ matchUp: noContextLoserMatchUp, provenance: exitProvenance });
  }

  return decorateResult({ result, stack, context: { progressExitStatus: true } });
}

/**
 * RULE 4, CARRIED PAST (census F2).
 *
 * An exit decided this matchUp while it awaited its second participant: the seat still to be filled was awarded it.
 * The awaited participant now arrives carrying an exit of their own. RULE 4 would collapse the two into a double
 * exit — but where a match recorded with two participants stands below this matchUp, that convergence would take
 * back a result somebody played, and it is refused. The 'carried exit' here is a participant carrying an exit
 * into an exit that was awaiting the 2nd participant, and in that case carrying it past makes sense.
 *
 * So the arrival takes what was awaiting them: they win this matchUp by the exit already decided here, advance
 * into its winner target, and carry their own exit on from there — as an exit is carried past a BYE (RULE 1). The
 * decided matchUp is left as it was; nothing is stamped on it for the arrival, whose exit is not met here. The
 * result below stands. Returned as RULE 1's context, so the cascade carries the exit on from where they landed.
 *
 * Only this shape: a single exit with the ARRIVAL's seat as its winning side, and something played below it
 * (asked as a convergence asks it: `getTargetsDownstream({ convergence: true })`). Anything else converges.
 */
function carryPastDecidedMatchUp({
  arrivingSideNumber,
  loserParticipantId,
  inContextMatchUps,
  tournamentRecord,
  drawDefinition,
  matchUpsMap,
  matchUp,
  event,
}: {
  inContextMatchUps?: HydratedMatchUp[];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  arrivingSideNumber: number;
  matchUpsMap?: MatchUpsMap;
  loserParticipantId?: string;
  matchUp: HydratedMatchUp;
  event?: Event;
}): ResultType | undefined {
  if (!isExit(matchUp.matchUpStatus) || matchUp.winningSide !== arrivingSideNumber) return undefined;

  const downstream = getTargetsDownstream({
    inContextDrawMatchUps: inContextMatchUps,
    matchUpId: matchUp.matchUpId,
    convergence: true,
    drawDefinition,
  });
  if (downstream.error) return decorateResult({ result: downstream, stack: 'progressExitStatus' });
  if (!downstream.activeDownstream) return undefined;

  const targetData = downstream.targetData;
  const winnerMatchUp = targetData?.targetMatchUps?.winnerMatchUp;
  const drawPosition = matchUp.sides?.find((side) => side.sideNumber === arrivingSideNumber)?.drawPosition;
  if (!winnerMatchUp || !drawPosition) return undefined;

  const advanced =
    winnerMatchUp.structureId === matchUp.structureId
      ? assignMatchUpDrawPosition({
          matchUpId: winnerMatchUp.matchUpId,
          inContextDrawMatchUps: inContextMatchUps ?? [],
          arrivesWithExit: true,
          tournamentRecord,
          drawDefinition,
          drawPosition,
          matchUpsMap,
          event,
        })
      : directWinner({
          winnerMatchUpDrawPositionIndex: targetData?.targetMatchUps?.winnerMatchUpDrawPositionIndex,
          winnerTargetLink: targetData?.targetLinks?.winnerTargetLink,
          inContextDrawMatchUps: inContextMatchUps,
          sourceMatchUpId: matchUp.matchUpId,
          winningDrawPosition: drawPosition,
          projectedWinningSide: undefined,
          sourceMatchUpStatus: undefined,
          dualMatchUp: undefined,
          tournamentRecord,
          drawDefinition,
          winnerMatchUp,
          matchUpsMap,
          event,
        });
  if (advanced?.error) return decorateResult({ result: advanced, stack: 'progressExitStatus' });

  const landed = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap })?.matchUps?.find(
    (candidate) => candidate.matchUpId === winnerMatchUp.matchUpId,
  );
  const context = landed
    ? { progressExitStatus: true, loserMatchUp: landed, loserParticipantId }
    : { progressExitStatus: true };
  return decorateResult({ result: { ...SUCCESS }, stack: 'progressExitStatus', context });
}
