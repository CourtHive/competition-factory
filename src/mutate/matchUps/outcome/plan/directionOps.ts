import { APPLY_VALUES, changesWinner, reentersWinner, removesDirection, storedLoserId } from './planShared';

// constants and types
import type { DirectionPlan, MatchUpWrite, OutcomeView, Route } from '../types';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import type { OutcomeOp } from '../ops';

/**
 * The builders of the plain shapes (S3, S4): the winner's placement, a swap's relabel, a cleared result's removal, and
 * the plain loser arrival.
 */

/**
 * The winner's position joining the next matchUp, which v1 stores ascending. For a changed winner the old winner's
 * position comes out as the new one goes in, and the matchUp's score with it (v1's `removeSubsequentRoundsParticipant`).
 */
export function winnerPlacementOps(
  view: OutcomeView,
  route: Route | undefined,
  write: MatchUpWrite,
  winner?: DirectionPlan['winner'],
): OutcomeOp[] {
  const target = view.targets.winner;
  const position = write.winningSide ? view.targets.sideDrawPositions[write.winningSide as 1 | 2] : undefined;
  if (!winner || !position || !target) return [];
  const replaced = changesWinner(view, route, write)
    ? view.targets.sideDrawPositions[view.existing.winningSide as 1 | 2]
    : undefined;
  const kept = target.drawPositions.filter((candidate) => candidate !== replaced);
  const drawPositions = [...new Set([...kept, position])].sort((a, b) => a - b);
  return [
    {
      op: 'setMatchUpDrawPositions',
      matchUpId: winner.matchUpId,
      drawPositions,
      ...(replaced ? { removedDrawPosition: replaced, placedDrawPosition: position } : {}),
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: winner.matchUpId },
  ];
}

/**
 * A swap's relabel in later rounds of its structure, each matchUp stamped: written before the result, as v1 announces
 * the path (`exchangePathPositions`) and then the score
 */
export function swapOps(view: OutcomeView, route: Route | undefined): OutcomeOp[] {
  const swap = view.targets.swap;
  const structureId = view.targets.source.structureId;
  if (route !== 'swap' || !swap || !structureId) return [];
  return [
    ...swap.pathMatchUpIds.flatMap((matchUpId): OutcomeOp[] => [
      { op: 'exchangeDrawPositions', matchUpId, structureId, positionA: swap.positionA, positionB: swap.positionB },
      { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
    ]),
    ...(swap.relabels ?? []).map((relabel): OutcomeOp => ({ op: 'relabelPosition', ...relabel })),
  ];
}

/** the direction whose placements are written: none for a re-entered winner, who stands where the first entry put them */
export function placedDirection(
  view: OutcomeView,
  route: Route | undefined,
  write: MatchUpWrite,
  direction?: DirectionPlan,
): DirectionPlan | undefined {
  return reentersWinner(view, route, write) || route === 'swap' || route === APPLY_VALUES ? undefined : direction;
}

/**
 * A cleared result's winner taken back out of the next matchUp, whose positions v1's writer then normalises, and its
 * loser out of the seat a link placed them on. Not a changed winner's: its winner's position is replaced in the one write
 * that places the new winner (`winnerPlacementOps`), and its loser is taken back first (`replacedLoserOps`).
 */
/**
 * A changed winner's old loser, taken back out of the seat the link placed them on before anything else is written: v1
 * removes the old direction (`removeDirectedParticipants`) before it writes the new result and directs it, so the old
 * loser's matchUp is announced first and the result and the new placements after it
 */
export function replacedLoserOps(
  view: OutcomeView,
  route: Route | undefined,
  write: MatchUpWrite,
  matchUpStatus?: MatchUpStatusUnion,
): OutcomeOp[] {
  return changesWinner(view, route, write) ? removedLoserOps(view, matchUpStatus) : [];
}

export function removedOps(
  view: OutcomeView,
  route: Route | undefined,
  write: MatchUpWrite,
  matchUpStatus?: MatchUpStatusUnion,
): OutcomeOp[] {
  if (changesWinner(view, route, write) || !removesDirection(view, route, write)) return [];
  // A final (no winner matchUp) takes back nothing here, its loser's fed seat included: that empty plan is what lets
  // the settle check abstain the call to v1. Hoisting the body (ruling 10) kept this guard because dropping it made
  // v2 own a cleared FIC 8 final (record equal to v1's there, unproven beyond), which is new ownership, not a hoist.
  const { targets, existing } = view;
  const position = existing.winningSide ? targets.sideDrawPositions[existing.winningSide as 1 | 2] : undefined;
  if (!position || !targets.winner || !targets.winnerMatchUpId) return [];
  return removalOps(view, matchUpStatus);
}

/**
 * S4's removal of the stored result's direction, whatever the route (ruling 10): the winner's position out of the next
 * matchUp, if there is one, then the loser's seat. The two reasons in front of it (`removalReason` on a cleared result,
 * `resultRemovalReason` on a result turned double exit) stay apart; this is only what they both take back. A final's
 * loser leg alone is emitted for the double-exit route; the cleared route guards it out above.
 */
export function removalOps(view: OutcomeView, matchUpStatus?: MatchUpStatusUnion): OutcomeOp[] {
  const { targets, existing } = view;
  const position = targets.sideDrawPositions[existing.winningSide as 1 | 2];
  const winner: OutcomeOp[] =
    position && targets.winner && targets.winnerMatchUpId
      ? [
          {
            op: 'setMatchUpDrawPositions',
            matchUpId: targets.winnerMatchUpId,
            drawPositions: targets.winner.drawPositions.filter((candidate) => candidate !== position),
            removedDrawPosition: position,
          },
          { op: 'stampUpdatedAt', entity: 'matchUp', id: targets.winnerMatchUpId },
        ]
      : [];
  return [...winner, ...removedLoserOps(view, matchUpStatus)];
}

/**
 * the loser's seat across the link emptied, and their matchUp's codes re-derived (`[]`) where it stored none. v1's
 * `removeDirectedLoser` re-derives them only when the call names a status (its `sourceMatchUpStatus`): a clear that names
 * none leaves them as they are. Only that write announces the matchUp, and its notice stamps the matchUp's structure, so
 * the structure is stamped with it and not otherwise
 */
export function removedLoserOps(view: OutcomeView, matchUpStatus?: MatchUpStatusUnion): OutcomeOp[] {
  const { loserMatchUpId, loserStructureId, loserTargetDrawPosition, loserMatchUpRecord } = view.targets;
  const participantId = storedLoserId(view);
  if (!loserMatchUpId || !loserStructureId || !loserTargetDrawPosition || !participantId) return [];
  const codes: OutcomeOp[] =
    !matchUpStatus || loserMatchUpRecord?.matchUpStatusCodes
      ? []
      : [
          { op: 'setMatchUpStatusCodes', matchUpId: loserMatchUpId, matchUpStatusCodes: [] },
          { op: 'stampUpdatedAt', entity: 'matchUp', id: loserMatchUpId },
          { op: 'stampUpdatedAt', entity: 'structure', id: loserStructureId },
        ];
  return [
    { op: 'clearPosition', structureId: loserStructureId, drawPosition: loserTargetDrawPosition, participantId },
    ...codes,
  ];
}

/** a plain loser arrival: the loser on the seat the link feeds */
export function arrivalOps(view: OutcomeView, loser?: DirectionPlan['loser']): OutcomeOp[] {
  const { loserStructureId, loserTargetDrawPosition } = view.targets;
  return loser?.arrives && loserStructureId && loserTargetDrawPosition
    ? [
        {
          op: 'assignPosition',
          structureId: loserStructureId,
          drawPosition: loserTargetDrawPosition,
          participantId: loser.participantId,
        },
      ]
    : [];
}
