import {
  getDeciderSnapshot,
  getDeciderTriggers,
  resolveDecider,
} from '@Mutate/matchUps/matchUpStatus/reconcileDecider';
import { matchUpsOf, positionAssignmentsOf, structuresOf } from '@Helpers/drawTopology/structureMembers';
import { getDeciderFinals } from '@Query/drawDefinition/deciderStructures';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findStructure } from '@Acquire/findStructure';
import { claimAssignment, claimEdges, type ClaimDraw } from '../plan/placementClaims';
import { isDoubleExit } from '@Validators/isExit';

import { BYE, DEFAULTED, DOUBLE_DEFAULT, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION, LOSER, WINNER } from '@Constants/drawDefinitionConstants';
import type { DrawDefinition } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { WorkingView } from '../overlay';
import type { OutcomeOp } from '../ops';

type Args = { before: DrawDefinition; working: WorkingView; matchUpId: string };
type Work = { ops: OutcomeOp[]; reasons: string[] };

/** The last pass sees the cascade's working draw, including movements caused by an upstream match. */
export function planDecider({ before, working, matchUpId }: Args): Work {
  const plan: Work = { ops: [], reasons: [] };
  const finalsBefore = getDeciderFinals(before);
  if (!finalsBefore.size) return plan;
  const triggers = getDeciderTriggers({
    finalsBefore,
    deciderSnapshotBefore: getDeciderSnapshot(before),
    drawDefinition: working.drawDefinition,
    mutatedMatchUpId: matchUpId,
  });
  for (const trigger of triggers) {
    const effect = resolveDecider({ ...trigger, drawDefinition: working.drawDefinition }, working);
    if (!effect) continue;
    if (effect.error) {
      plan.reasons.push('cannot resolve shared final target');
      continue;
    }
    if (effect.seats) {
      const { assignments, structureId, winnerId, loserId } = effect.seats;
      const finalists = [winnerId, winnerId && loserId];
      assignments.forEach((seat, index) => {
        const participantId = finalists[index];
        if (seat.participantId === participantId && (participantId || !Object.hasOwn(seat, 'participantId'))) return;
        plan.ops.push({ op: 'relabelPosition', structureId, drawPosition: seat.drawPosition, participantId });
      });
    }
    if (effect.matchUpStatus) {
      plan.ops.push({
        op: 'setMatchUpResult',
        matchUpId: effect.decider.matchUpId,
        matchUpStatus: effect.matchUpStatus,
        resetsScore: true,
        removesWinningSide: true,
        stampsScoredTime: false,
      });
      plan.reasons.push('Decider result notice and stamp have not been certified');
    }
  }
  return plan;
}

/** A typed installer of an existing reservation. Its winner reached the final; its loser did not. */
function reservation(draw: ClaimDraw, final: HydratedMatchUp) {
  const { drawDefinition, inContextDrawMatchUps } = draw;
  const targets = claimEdges(draw, final);
  const dest = targets.targetMatchUps?.loserMatchUp;
  const position = targets.targetMatchUps?.loserTargetDrawPosition;
  if (
    !dest ||
    !position ||
    targets.targetMatchUps?.winnerMatchUp?.matchUpId !== dest.matchUpId ||
    targets.targetMatchUps?.winnerTargetDrawPosition !== position ||
    dest.structureId === final.structureId ||
    !dest.drawPositions?.includes(position) ||
    dest.matchUpStatus !== BYE ||
    dest.winningSide ||
    Object.keys(dest.score ?? {}).length ||
    Object.keys(final.score ?? {}).length ||
    !(isDoubleExit(final.matchUpStatus) || final.matchUpStatus === DEFAULTED || final.matchUpStatus === WALKOVER)
  )
    return;
  const { structure } = findStructure({ drawDefinition, structureId: dest.structureId });
  const links = drawDefinition.links?.filter((link) => link.target?.structureId === dest.structureId);
  if (
    links?.length !== 2 ||
    links.some(
      (link) =>
        link.linkCondition ||
        link.source?.structureId !== final.structureId ||
        link.source?.roundNumber !== final.roundNumber ||
        link.target?.roundNumber !== dest.roundNumber,
    ) ||
    !links.some((link) => link.linkType === WINNER) ||
    !links.some((link) => link.linkType === LOSER) ||
    matchUpsOf(structure)?.length !== 1 ||
    structuresOf(structure)?.length ||
    positionAssignmentsOf(structure)?.length !== 2
  )
    return;
  const seat = claimAssignment(draw, dest, position);
  if (!seat?.bye || !seat.byeFromPropagation || seat.participantId || seat.qualifier) return;
  const donors: HydratedMatchUp[] = [];
  for (const match of inContextDrawMatchUps) {
    if (match.collectionId) continue;
    const edges = claimEdges(draw, match);
    if (!edges.targetMatchUps) return;
    const winner = edges.targetMatchUps.winnerMatchUp?.matchUpId;
    const loser = edges.targetMatchUps.loserMatchUp?.matchUpId;
    if (match.matchUpId === dest.matchUpId && (winner || loser)) return;
    if (match.matchUpId !== final.matchUpId && (winner === dest.matchUpId || loser === dest.matchUpId)) return;
    if (winner === final.matchUpId && isDoubleExit(match.matchUpStatus)) {
      if (loser === final.matchUpId) return;
      donors.push(match);
    }
  }
  const [donor] = donors;
  if (donors.length !== 1 || donor.winningSide || Object.keys(donor.score ?? {}).length) return;
  const single = donor.matchUpStatus === DOUBLE_DEFAULT ? DEFAULTED : WALKOVER;
  if (
    (!isDoubleExit(final.matchUpStatus) && final.matchUpStatus !== single) ||
    (final.matchUpStatus === DOUBLE_DEFAULT && single !== DEFAULTED)
  )
    return;
  const entries = Object.entries(final.sideExitProvenance ?? {}).filter(
    ([, mark]) => mark.sourceMatchUpId === donor.matchUpId,
  );
  if (entries.length !== 1) return;
  const [side, mark] = entries[0];
  if (
    !['1', '2'].includes(side) ||
    Number(side) === final.winningSide ||
    mark.previousMatchUpStatus !== donor.matchUpStatus ||
    mark.matchUpStatus !== single
  )
    return;
  return {
    finalId: final.matchUpId,
    receiverId: dest.matchUpId,
    structureId: dest.structureId,
    drawPosition: position,
    producerId: donor.matchUpId,
    status: donor.matchUpStatus,
  };
}

export function deciderReservations(before: DrawDefinition) {
  const finals = getDeciderFinals(before);
  if (before.drawType !== DOUBLE_ELIMINATION || !finals.size) return [];
  const matchUpsMap = getMatchUpsMap({ drawDefinition: before });
  const inContextDrawMatchUps =
    getAllDrawMatchUps({ drawDefinition: before, matchUpsMap, inContext: true }).matchUps ?? [];
  const draw = { drawDefinition: before, inContextDrawMatchUps };
  return inContextDrawMatchUps
    .filter((match) => finals.has(match.matchUpId))
    .flatMap((final) => reservation(draw, final) ?? []);
}

/** After earlier waves, re-read the typed producer. A change to another final-side entry need not undo this grant. */
export function planDeciderReservations({ before, working }: Args): Work {
  const plan: Work = { ops: [], reasons: [] };
  for (const grant of deciderReservations(before)) {
    const donor = working.inContextDrawMatchUps.find((match) => match.matchUpId === grant.producerId);
    const receiver = working.inContextDrawMatchUps.find((match) => match.matchUpId === grant.receiverId);
    if (!donor || !receiver || receiver.structureId !== grant.structureId) {
      plan.reasons.push('shared Decider reservation lost its mapped holder or producer');
      continue;
    }
    if (donor.matchUpStatus === grant.status) continue;
    const seat = claimAssignment(working, receiver, grant.drawPosition);
    if (!seat?.bye || !seat.byeFromPropagation) continue;
    if (seat.participantId || seat.qualifier) {
      plan.reasons.push('changed Decider reservation has an occupied or qualified receiver');
      continue;
    }
    const final = working.inContextDrawMatchUps.find((match) => match.matchUpId === grant.finalId);
    const replacement = final && reservation(working, final);
    if (replacement && replacement.producerId !== grant.producerId) {
      plan.reasons.push('another producer supports the shared Decider reservation');
      continue;
    }
    plan.ops.push({ op: 'withdrawBye', structureId: grant.structureId, drawPosition: grant.drawPosition });
    plan.reasons.push('Decider reservation removal notice and stamp have not been certified');
  }
  return plan;
}
