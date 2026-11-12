import { getSideExitProvenance } from '@Helpers/drawTopology/sideExitProvenance';
import { getDrawPositionSideNumber } from '@Query/matchUps/getDrawPositionSides';
import { producedTarget, producedTargetReason } from './producedTarget';
import { byeHeldProducedOps } from './byeHeldPassage';
import { landingLoserLink } from './landingLoserLink';
import { indexed, pairedFeeder } from './planShared';
import { convergedWrite } from './convergedWrite';
import { releaseWalk } from '../unwindWalk';
import {
  buildCarriedExitProvenance,
  collapseDoubleExitStatus,
  retainPolicyCodes,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants and types
import type { ConvergedContext, ConvergedWrite } from './convergedWrite';
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { DrawDefinition } from '@Types/tournamentTypes';
import type { OutcomeRequest, OutcomeView } from '../types';
import type { ProducedTarget } from './producedTarget';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { SeatFrame } from './carriedContinuation';

/**
 * 1b: a double exit's loser seat converging with the pending exit standing on its loser matchUp, under
 * `doubleExitPropagateBye: false` (`handleEmptyExitLoser`), the converged winner's advance and its held carry (1c).
 */

export type PendingConvergence = ConvergedWrite & { touched: string[] };

/**
 * 1b, the off-diagonal cell (ruling 3: its own rule): under `doubleExitPropagateBye: false` a double exit's loser seat
 * meets the pending exit an earlier double exit produced on its loser matchUp, with nobody in it. v1 converges it there
 * (`handleLoserMatchUp` → `handleEmptyExitLoser`, DEA:646–781): the collapsed double exit written by `modifyMatchUpScore`
 * (`removeScore`, codes retained, no winner), the arriving side's carried origin merged beside the provenance standing
 * there, then its own produced exit (`advanceConvergedWinner`, on the collapsed status), then its loser link
 * (`serveConvergedLoserLink`). Planned where each step takes v1's plain branch; refused, each at its own line, where v1
 * takes another or where v2 does not reproduce a read.
 */
export function pendingConvergence(
  view: OutcomeView,
  frame: SeatFrame,
  request: OutcomeRequest,
  source: HydratedMatchUp,
  context: ConvergedContext,
): PendingConvergence | undefined {
  const { cascadeStatus, lineage } = frame;
  const { drawDefinition } = context;
  const pending = indexed(view, frame.seat.at?.matchUpId);
  const seat = view.targets.loserTargetSeat;
  const drawPosition = frame.seat.at?.drawPosition;
  if (!pending || !seat || !drawPosition || !drawDefinition) return undefined;
  // the FIRST_MATCHUP gate (DEA:290–313) is not certified here
  if (frame.seat.linkCondition) return undefined;
  // a BYE on the seat: reclaimed (DEA:86–121) or settled (DEA:483); a fed seat takes a BYE (DEA:449)
  if (seat.bye || pending.hasFedDrawPosition) return undefined;
  // the empty exit (DEA:163): a single exit with nobody in it, produced by a double exit beside this one
  const empty = !pending.sides?.some((side) => side.participantId || side.participant);
  if ((pending.matchUpStatus !== WALKOVER && pending.matchUpStatus !== DEFAULTED) || !empty) return undefined;
  // the request's spread (F6): a format, or a stored default's process codes, are not written here
  if (request.matchUpFormat || pending.processCodes?.length) return undefined;
  // codes v1 attributes from what it retains: only none is certified
  if (retainPolicyCodes(pending).length || pending.matchUpStatusCode || pending.sideStatusCodes) return undefined;
  // a loser matchUp in the source's structure could be read by the landing's convergence
  if (pending.structureId === source.structureId) return undefined;
  // the arriving side, read structurally as v1 reads it (0 where the position is absent: no entry is built)
  const exitingSideNumber =
    getDrawPositionSideNumber({
      matchUp: { ...pending, sides: undefined },
      structureId: pending.structureId,
      drawDefinition,
      drawPosition,
    }) ?? 0;
  const matchUpStatus = collapseDoubleExitStatus([cascadeStatus, pending.matchUpStatus]);
  const converged: PendingConvergence = {
    landing: pending,
    matchUpStatus,
    provenance: {
      ...getSideExitProvenance({ matchUp: pending }),
      ...buildCarriedExitProvenance({ ...lineage, matchUpStatus: cascadeStatus, exitingSideNumber }),
    },
    matchUpStatusCodes: [],
    resetsScore: true,
    touched: [pending.matchUpId],
  };
  // a final produces nothing (`advanceConvergedWinner` finds no winner target)
  const advanced = pending.winnerMatchUpId ? convergedWinner(view, converged, drawDefinition, context) : converged;
  if (!advanced || !pending.loserMatchUpId) return advanced;
  // then its loser link (`serveConvergedLoserLink`, DEA:767–775), on the status this frame was handed (DEA:773), its
  // dispatch reading the frame's params channel: the call's entry, or after a decided result's removal its re-read
  const reread = view.existing.winningSide
    ? context.landing?.(context.prefix ?? [], pending.matchUpId, cascadeStatus)?.working.inContextDrawMatchUps
    : view.inContextDrawMatchUps;
  const served = reread
    ? landingLoserLink(
        {
          phase: 'landing-converged',
          matchUpId: pending.matchUpId,
          prefix: [...(context.prefix ?? []), ...convergedWrite(view, advanced)],
          paramsChannel: reread,
          cascadeStatus,
        },
        context.landing,
      )
    : undefined;
  if (!served) return undefined;
  return { ...advanced, loserLinkOps: served.ops, touched: [...advanced.touched, ...served.touched] };
}

/**
 * The converged matchUp's produced exit (`advanceConvergedWinner` → `conditionallyAdvanceDrawPosition`, on the collapsed
 * status): its own positions taken back out of the next matchUp first (DEA:976), then the exit written there pending.
 * Refused where a stale advance is taken back too (DEA:1003), where that matchUp links its loser on (the BYE on its loser
 * seat, DEA:1050–1063), or where the pending write is not clean.
 */
function convergedWinner(
  view: OutcomeView,
  converged: PendingConvergence,
  drawDefinition: DrawDefinition,
  context?: ConvergedContext,
): PendingConvergence | undefined {
  const { landing, matchUpStatus } = converged;
  const target = producedTarget(view, landing, matchUpStatus);
  if (!target) return undefined;
  const { entry } = target;
  // F3: the BYE on that matchUp's own loser seat, placed whatever the policy (DEA:1050–1063)
  if (entry.loserMatchUpId) return undefined;
  // in a feed round the awarded side is the fed seat, whose position stands for the participant fed from another
  // structure: it is not the converged matchUp's own advancement, so DEA:976 leaves it (the reservation is certified below)
  const fedSeat = target.feed
    ? entry.sides?.find((side) => side.sideNumber === target.awardedSide)?.drawPosition
    : undefined;
  // 1c: a BYE on the awarded side keeps its position there (the matchUp stays a BYE, DEA:1185); not this one's own
  const bye = entry.sides?.find((side) => side.bye);
  if (bye && bye.sideNumber !== target.awardedSide) return undefined;
  const held = (entry.drawPositions ?? []).filter(
    (position): position is number => !!position && position !== fedSeat && position !== bye?.drawPosition,
  );
  const own = held.filter((position) => landing.drawPositions?.includes(position));
  if (own.length !== held.length) return undefined;
  const release = () =>
    own.length
      ? releaseWalk({
          inContextDrawMatchUps: view.inContextDrawMatchUps ?? [],
          propagatesBye: !!view.draw.propagatesByeOnDoubleExit,
          fromRoundNumber: entry.roundNumber as number,
          structureId: entry.structureId,
          drawPositions: own,
          drawDefinition,
        })
      : [];
  if (bye) {
    const withdrawn = release();
    if (!withdrawn) return undefined;
    // its own positions taken back first (DEA:976): the passage reads the draw as the convergence and that release leave it
    const prefix = [...(context?.prefix ?? []), ...convergedWrite(view, { ...converged, withdrawn })];
    const projected = context?.landing?.(prefix, landing.matchUpId, matchUpStatus);
    return projected ? heldCarry(projected.view, { ...converged, withdrawn }, target) : undefined;
  }
  // the next matchUp as the produced exit finds it, its positions taken back: read before the walk, which a refusal
  // here would spend for nothing (G4, FIRST_MATCH_LOSER_CONSOLATION)
  const released = own.length
    ? {
        ...entry,
        drawPositions: [],
        sides: entry.sides?.map((side) =>
          own.includes(side.drawPosition as number) ? { ...side, drawPosition: undefined } : side,
        ),
      }
    : entry;
  const onward = { ...target, entry: released as HydratedMatchUp };
  if (!producedTargetReason(view, landing, onward)) return undefined;
  const withdrawn = release();
  if (!withdrawn) return undefined;
  const touched = [
    ...converged.touched,
    entry.matchUpId,
    ...withdrawn.flatMap((op) =>
      op.op === 'setMatchUpDrawPositions' && op.matchUpId !== entry.matchUpId ? [op.matchUpId] : [],
    ),
  ];
  return { ...converged, withdrawn, onward, touched };
}

/**
 * 1c: the converged winner's held carry. Its target holds a BYE on the side the produced exit is awarded to, so v1 leaves
 * it a BYE and carries the exit on (`conditionallyAdvanceDrawPosition` → `advanceByeAdvancedDrawPosition`, DEA:1185,
 * :1945), the passage `byeHeldProduced` plans for a call's own double exit, here from the converged matchUp at its
 * collapsed status. Planned where none of its own advancement stands to be taken back first; a convergence beyond with a
 * carried exit (`convergeCarriedExit`, DEA:2914) is refused inside the passage.
 */
function heldCarry(
  view: OutcomeView,
  converged: PendingConvergence,
  target: ProducedTarget,
): PendingConvergence | undefined {
  const { landing, matchUpStatus } = converged;
  const heldPassage = byeHeldProducedOps(
    view,
    { matchUpId: target.entry.matchUpId, matchUpStatus: target.matchUpStatus, winningSide: target.awardedSide },
    { matchUpId: landing.matchUpId, matchUpStatus, paired: pairedFeeder(view, landing), loserLinked: false },
  );
  if (!heldPassage?.length) return undefined;
  const touched = heldPassage.flatMap((op) => ('matchUpId' in op && op.matchUpId ? [op.matchUpId] : []));
  return { ...converged, heldPassage, touched: [...new Set([...converged.touched, ...touched])] };
}
