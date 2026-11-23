import { getSideExitProvenance, carriedExitStatus } from '@Helpers/drawTopology/sideExitProvenance';
import { byeSeatPositionsOwedTo } from '@Mutate/matchUps/matchUpStatus/feederSendsNobody';
import { checkScoreHasValue } from '@Scoring/analysis/checkScoreHasValue';
import { claimAssignment, claimEdges } from '../plan/placementClaims';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { LOSER } from '@Constants/drawDefinitionConstants';
import { releasedAward } from '../plan/carriedExit';
import { isExit } from '@Validators/isExit';

import type { DrawDefinition } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { OutcomeView } from '../types';

type Frame = { drawDefinition: DrawDefinition; inContextDrawMatchUps: HydratedMatchUp[] };
export type WithdrawnHolder = {
  holder: HydratedMatchUp;
  position: number;
  participantId: string;
  release?: { onward: HydratedMatchUp; position: number; participantId: string };
};

function carriedLanding(frame: Frame, donor: HydratedMatchUp, holder: HydratedMatchUp) {
  const edge = claimEdges(frame, donor);
  const position = edge.targetMatchUps?.loserTargetDrawPosition;
  if (
    !donor.winningSide ||
    !isExit(donor.matchUpStatus) ||
    !position ||
    !edge.targetLinks?.loserTargetLink ||
    edge.targetMatchUps?.loserMatchUp?.matchUpId !== holder.matchUpId ||
    edge.targetMatchUps?.winnerMatchUp?.matchUpId === holder.matchUpId ||
    donor.structureId === holder.structureId
  )
    return;
  const losing = donor.sides?.find((s) => s.sideNumber === 3 - donor.winningSide!);
  const carrier = holder.sides?.find((s) => s.drawPosition === position);
  if (
    !carrier?.sideNumber ||
    !carrier.participantId ||
    carrier.participantId !== losing?.participantId ||
    claimAssignment(frame, holder, position)?.participantId !== carrier.participantId ||
    !isExit(holder.matchUpStatus) ||
    holder.winningSide === carrier.sideNumber ||
    holder.sides?.some((s) => s.bye || s.qualifier) ||
    checkScoreHasValue({ score: holder.score })
  )
    return;
  const marks = getSideExitProvenance({ matchUp: holder });
  const mark = marks?.[carrier.sideNumber];
  if (
    !marks ||
    !mark ||
    Object.keys(marks).length !== 1 ||
    mark.sourceMatchUpId !== donor.matchUpId ||
    mark.previousMatchUpStatus !== donor.matchUpStatus ||
    carriedExitStatus(mark) !== holder.matchUpStatus
  )
    return;
  return { holder, position, participantId: carrier.participantId };
}

/** A resetting award takes back the positions it sent. Certify the one actual onward place,
 * or prove that no later match holds any of its positions. A BYE debt or crossing winner
 * link can require further effects and is left to a separate proof. */
function onwardRelease(view: OutcomeView, frame: Frame, holder: HydratedMatchUp): WithdrawnHolder['release'] | false {
  const edges = claimEdges(frame, holder);
  if (
    !edges.targetMatchUps ||
    edges.targetLinks.winnerTargetLink ||
    edges.targetMatchUps.byeMatchUp ||
    byeSeatPositionsOwedTo({ ...frame, matchUpId: holder.matchUpId }).length
  )
    return false;
  const positions = holder.drawPositions?.filter(Boolean) ?? [];
  const holders = frame.inContextDrawMatchUps.filter(
    (m) =>
      m.structureId === holder.structureId &&
      (m.roundNumber ?? 0) > (holder.roundNumber ?? 0) &&
      positions.some((p) => m.drawPositions?.includes(p)),
  );
  if (!holders.length) return;
  const awarded = holder.sides?.find((s) => s.sideNumber && s.sideNumber === holder.winningSide);
  const onward = edges.targetMatchUps.winnerMatchUp;
  const award = releasedAward(view, holder, awarded?.drawPosition);
  if (
    holders.length !== 1 ||
    !onward ||
    holders[0].matchUpId !== onward.matchUpId ||
    !awarded?.drawPosition ||
    !awarded.participantId ||
    !award ||
    award.matchUpId !== onward.matchUpId ||
    claimAssignment(frame, holder, awarded.drawPosition)?.participantId !== awarded.participantId ||
    !onward.sides?.some((s) => s.drawPosition === awarded.drawPosition && s.participantId === awarded.participantId) ||
    positions.some((p) => p !== awarded.drawPosition && onward.drawPositions?.includes(p))
  )
    return false;
  return { onward, position: awarded.drawPosition, participantId: awarded.participantId };
}

/** Onward removal searches every outgoing loser link of the structure. A participant there
 * without the next sourced mark can still trigger another release, even outside this round. */
function accountsForLinkedSeats(drawDefinition: DrawDefinition, chain: WithdrawnHolder[]) {
  return chain.every(({ holder, participantId }, i) => {
    const next = chain[i + 1];
    return (drawDefinition.links ?? []).every((link) => {
      if (link.linkType !== LOSER || link.source.structureId !== holder.structureId) return true;
      const structureId = link.target.structureId;
      const { positionAssignments } = getPositionAssignments({ drawDefinition, structureId });
      return positionAssignments.every(
        (seat) =>
          seat.participantId !== participantId ||
          (next?.holder.structureId === structureId && next.position === seat.drawPosition),
      );
    });
  });
}

/** Identity-keyed withdrawal visits the next holder of a losing carry before direct winner
 * removal. With just one proved consumer per hop, its frontier order is the actual link order.
 * Validate the mark against the previous loser and the receiving assignment at every hop. */
export function withdrawalChain(
  view: OutcomeView,
  drawDefinition: DrawDefinition,
  source: HydratedMatchUp,
): WithdrawnHolder[] | undefined {
  const matches = view.inContextDrawMatchUps;
  if (!matches || view.group || view.isTeam || view.line) return;
  const frame = { drawDefinition, inContextDrawMatchUps: matches };
  const chain: WithdrawnHolder[] = [];
  const seen = new Set([source.structureId]);
  let donor = source;
  for (;;) {
    const consumers = matches.filter((m) =>
      Object.values(getSideExitProvenance({ matchUp: m }) ?? {}).some(
        (mark) => mark.sourceMatchUpId === donor.matchUpId,
      ),
    );
    if (!consumers.length) break;
    if (consumers.length !== 1 || seen.has(consumers[0].structureId)) return;
    const next = carriedLanding(frame, donor, consumers[0]);
    if (!next) return;
    const release = onwardRelease(view, frame, next.holder);
    if (release === false) return;
    chain.push({ ...next, release });
    seen.add(next.holder.structureId);
    donor = next.holder;
  }
  return chain.length && accountsForLinkedSeats(drawDefinition, chain) ? chain : undefined;
}
