import { positionAssignmentsOf } from '@Helpers/drawTopology/structureMembers';
import { landingLoserLink } from './landingLoserLink';
import { withdrawnExitReset } from './unwindPath';
import { indexed } from './planShared';

// constants and types
import type { DrawDefinition, MatchUpStatusUnion, SideExitProvenanceEntry } from '@Types/tournamentTypes';
import { BYE } from '@Constants/matchUpStatusConstants';
import type { LandingView, OutcomeView } from '../types';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { OutcomeOp } from '../ops';

/**
 * 2c-1 (Mentat assessment/2026-11-13-outcome-v2-2c-carried-landing-ruling.md): a carried exit converging (RULE 4) at a
 * landing that links its loser on, under `doubleExitPropagateBye: false`. v1's `setMatchUpState` removes the landing's
 * directed participants (`removeDirectedParticipants`, RDP) before `doubleExitAdvancement` re-reads its targets
 * (attemptToSetMatchUpStatus.ts:149–153): the score reset (row 1, the convergence's own result write), the exit the
 * landing produced withdrawn (row 2, `withdrawProducedExits` → `applyWithdrawnExits`), and the first carrier's seat in
 * the loser structure cleared with no notice (row 5, `removeDirectedLoser`). DEA then serves the landing's loser link on
 * the reread targets, as a re-entry serves it (L2 `reentry`, DEA:316).
 *
 * The prefix models those rows only. Certified where every RDP row it does not model writes nothing: no winner advanced
 * (row 3, the convergence's `advanced` gate), no BYE in the landing's rounds (rows 4 and 6), the carrier gone nowhere past
 * the loser matchUp (rows 5a–5e), and the withdrawn exit the loser matchUp's own, sending nobody on (row 2 alone, and row
 * 5f re-deriving `[]` from the provenance row 2 clears). Undefined, the call v1's, otherwise.
 */
export function servedLandingOps({
  matchUpStatus,
  landingView,
  matchUpId,
  prefix,
}: {
  /** the double exit the convergence writes (F1: the status DEA is handed) */
  matchUpStatus: MatchUpStatusUnion;
  landingView?: LandingView;
  /** the landing */
  matchUpId: string;
  /** what v1 has written when RDP reads: the call's program and the convergence's own result write */
  prefix: OutcomeOp[];
}): OutcomeOp[] | undefined {
  const read = landingView?.(prefix, matchUpId, matchUpStatus);
  if (!read) return undefined;
  const { view, working } = read;
  const landing = indexed(view, matchUpId);
  const { loserMatchUpId, loserStructureId, loserTargetDrawPosition, loserTargetSeat } = view.targets;
  const loserMatchUp = indexed(view, loserMatchUpId);
  if (!landing || !loserMatchUp || !loserStructureId || !loserTargetDrawPosition) return undefined;
  if (loserMatchUp.structureId === landing.structureId || loserMatchUp.collectionId) return undefined;
  const carrier = loserTargetSeat?.participantId;
  if (!carrier || !landing.sides?.some((side) => side.participantId === carrier)) return undefined;
  if (!removalCertified(view, working.drawDefinition, landing, loserMatchUp, loserTargetDrawPosition, carrier))
    return undefined;

  // row 2: the exit the landing produced on its loser matchUp withdrawn (`applyWithdrawnExits`, announced with the event)
  // `applyWithdrawnExits` resets the status and leaves the schedule: the produced exit's `scoredTime` stands
  const withdrawn = withdrawnExitReset(loserMatchUp.matchUpId, { removesWinningSide: true, keepsScoredTime: true });
  // row 5: the first carrier's seat cleared; `removeDirectedLoser` announces no assignments
  const cleared: OutcomeOp[] = [
    {
      op: 'clearPosition',
      structureId: loserStructureId,
      drawPosition: loserTargetDrawPosition,
      participantId: carrier,
    },
  ];
  const frame = {
    phase: 'reentry' as const,
    cascadeStatus: matchUpStatus,
    prefix: [...prefix, ...withdrawn, ...cleared],
    matchUpId,
  };
  const served = landingLoserLink(frame, landingView);
  return served && [...withdrawn, ...cleared, ...served.ops];
}

/** every RDP row the prefix does not model writes nothing */
function removalCertified(
  view: OutcomeView,
  drawDefinition: DrawDefinition,
  landing: HydratedMatchUp,
  loserMatchUp: HydratedMatchUp,
  drawPosition: number,
  carrier: string,
): boolean {
  const matchUps = view.inContextDrawMatchUps ?? [];
  // rows 4 and 6: no BYE where the landing's positions stand in its structure (`winnerHadBye`, `byeMatchUp`)
  const positions = (landing.drawPositions ?? []).filter(Boolean);
  const inLandingStructure = matchUps.filter((matchUp) => matchUp.structureId === landing.structureId);
  if (inLandingStructure.some((m) => m.matchUpStatus === BYE && m.drawPositions?.some((p) => positions.includes(p))))
    return false;
  // row 2 alone: the only exit the landing produced stands on its loser matchUp, which sent nobody on
  const produced = matchUps.filter((matchUp) =>
    Object.values(matchUp.sideExitProvenance ?? {}).some(
      (entry: SideExitProvenanceEntry) => entry?.sourceMatchUpId === landing.matchUpId,
    ),
  );
  if (produced.length !== 1 || produced[0].matchUpId !== loserMatchUp.matchUpId) return false;
  const carrierSide = loserMatchUp.sides?.find((side) => side.drawPosition === drawPosition);
  if (!carrierSide || carrierSide.participantId !== carrier) return false;
  const opposite = loserMatchUp.sides?.find((side) => side.sideNumber !== carrierSide.sideNumber);
  if (opposite?.participantId || opposite?.bye) return false;
  if (loserMatchUp.winningSide === carrierSide.sideNumber || loserMatchUp.score?.sets?.length) return false;
  // rows 5a–5e: the carrier's position nowhere past the loser matchUp, and the carrier placed in no structure but the
  // landing's, the loser matchUp's, and those that fed the landing
  const sameStructure = matchUps.filter((matchUp) => matchUp.structureId === loserMatchUp.structureId);
  if (sameStructure.some((m) => m.matchUpId !== loserMatchUp.matchUpId && m.drawPositions?.includes(drawPosition)))
    return false;
  const feeders = new Set(
    (drawDefinition.links ?? [])
      .filter((link) => link.target?.structureId === landing.structureId)
      .map((link) => link.source?.structureId),
  );
  const placed = (drawDefinition.structures ?? []).filter((structure) =>
    positionAssignmentsOf(structure)?.some((assignment) => assignment.participantId === carrier),
  );
  return placed.every(
    ({ structureId }) =>
      structureId === landing.structureId || structureId === loserMatchUp.structureId || feeders.has(structureId),
  );
}
