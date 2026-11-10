import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { buildSideExitProvenance } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { indexed, onwardFrom } from './planShared';

// constants and types
import { DEFAULTED, DOUBLE_DEFAULT, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { MatchUpStatusUnion, SideExitProvenance } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { OutcomeView } from '../types';
import type { OutcomeOp } from '../ops';

/**
 * Where a double exit produces its exit (S5): the next matchUp of the structure, read from the index as
 * `planProducedExit` reads the call's, and the pending exit's write there.
 */

export type RetainedRelayReservation = {
  target: Omit<ProducedTarget, 'reservation'>;
  onward: { matchUpId: string; drawPositions: number[]; provenance: SideExitProvenance };
};

export type ProducedTarget = {
  /** A reservation into the exact foreign exit retained by this unwind, certified before direction planning. */
  reservation?: RetainedRelayReservation;
  entry: HydratedMatchUp;
  /** the side the double exit feeds, and the side its produced exit is awarded to */
  fedSide: 1 | 2;
  awardedSide: 1 | 2;
  matchUpStatus: MatchUpStatusUnion;
  /** the next round is a feed round: the awarded side is the seat fed from another structure */
  feed: boolean;
};

/**
 * Where a double exit at `source` produces its exit, read from the index as `planProducedExit` reads the call's: the next
 * matchUp of the same structure, in a round of half as many matchUps (roundPosition n feeds side 1 when odd and 2 when
 * even) or a feed round of as many (it feeds side 2, beside the fed seat). A DOUBLE_DEFAULT produces a DEFAULTED, any
 * other double exit a WALKOVER.
 */
export function producedTarget(
  view: OutcomeView,
  source: HydratedMatchUp,
  sourceStatus?: MatchUpStatusUnion,
): ProducedTarget | undefined {
  const index = view.inContextDrawMatchUps ?? [];
  const entry = indexed(view, source.winnerMatchUpId);
  const { roundNumber, roundPosition, structureId } = source;
  if (!entry || !roundNumber || !roundPosition || entry.structureId !== structureId) return undefined;
  if (entry.roundNumber !== roundNumber + 1) return undefined;
  const count = (round?: number) =>
    index.filter((m) => m.structureId === structureId && m.roundNumber === round).length;
  const here = count(roundNumber);
  const there = count(entry.roundNumber);
  const feed = there === here && entry.roundPosition === roundPosition && !!entry.feedRound;
  const plain = there * 2 === here && entry.roundPosition === Math.ceil(roundPosition / 2);
  if (!feed && !plain) return undefined;
  const fedSide = feed || roundPosition % 2 === 0 ? 2 : 1;
  const matchUpStatus = sourceStatus === DOUBLE_DEFAULT ? DEFAULTED : WALKOVER;
  return { entry, fedSide, awardedSide: (3 - fedSide) as 1 | 2, matchUpStatus, feed };
}

/**
 * The produced exit lands pending, planned where its matchUp is to be played with no winner, score, BYE, exit, codes or
 * provenance, and links no loser on; and, on the side it is awarded to, nobody stands: in a feed round a fed seat whose
 * empty position goes ahead into a clean next matchUp (the reservation), otherwise no position at all, beside a feeder
 * still to be played. Anything else (an award, a convergence there) is v1's.
 */
export function producedTargetReason(
  view: OutcomeView,
  source: HydratedMatchUp,
  target: ProducedTarget,
  loserLinked?: boolean,
): boolean {
  const { entry } = target;
  if (entry.matchUpStatus !== TO_BE_PLAYED || entry.winningSide || entry.score?.scoreStringSide1) return false;
  if (entry.matchUpStatusCodes?.length || Object.keys(entry.sideExitProvenance ?? {}).length) return false;
  if ((entry.loserMatchUpId && !loserLinked) || entry.sides?.some((side) => side.bye)) return false;
  const awarded = entry.sides?.find((side) => side.sideNumber === target.awardedSide);
  if (awarded?.participantId) return false;
  if (target.feed)
    return !!awarded?.drawPosition && (!!target.reservation || !!onwardFrom(view, entry, awarded.drawPosition));
  if (awarded?.drawPosition) return false;
  const pairedPosition =
    (source.roundPosition ?? 0) % 2 ? (source.roundPosition ?? 0) + 1 : (source.roundPosition ?? 0) - 1;
  const paired = view.inContextDrawMatchUps?.find(
    (m) =>
      m.structureId === source.structureId &&
      m.roundNumber === source.roundNumber &&
      m.roundPosition === pairedPosition,
  );
  return paired?.matchUpStatus === TO_BE_PLAYED;
}

/** the produced exit's write, as v1's `doubleExitAdvancement` makes it (#5874), and in a feed round the reservation */
export function producedTargetOps(
  view: OutcomeView,
  target: ProducedTarget,
  sourceMatchUpId: string,
  sourceStatus: MatchUpStatusUnion,
): OutcomeOp[] {
  const { entry } = target;
  const provenance = buildSideExitProvenance({
    sourceSideNumber: target.fedSide,
    sourceMatchUpStatus: sourceStatus,
    sourceMatchUpId,
  });
  const awarded = entry.sides?.find((side) => side.sideNumber === target.awardedSide);
  const onward =
    target.reservation?.onward ??
    (target.feed && awarded?.drawPosition ? onwardFrom(view, entry, awarded.drawPosition) : undefined);
  return [
    {
      op: 'setMatchUpResult',
      matchUpId: entry.matchUpId,
      matchUpStatus: target.matchUpStatus,
      matchUpStatusCodes: [],
      stampsScoredTime: false,
      ...(target.reservation ? { restoresNoticeIdentity: true as const } : {}),
      ...(target.matchUpStatus === WALKOVER ? { resetsScore: true, score: toBePlayed.score } : {}),
    },
    ...(provenance ? [{ op: 'mergeSideExitProvenance' as const, matchUpId: entry.matchUpId, provenance }] : []),
    { op: 'stampUpdatedAt', entity: 'matchUp', id: entry.matchUpId },
    ...(onward
      ? [
          {
            op: 'setMatchUpDrawPositions' as const,
            matchUpId: onward.matchUpId,
            drawPositions: onward.drawPositions,
            announcesContext: false as const,
          },
          ...(target.reservation
            ? [
                {
                  op: 'setSideExitProvenance' as const,
                  matchUpId: onward.matchUpId,
                  provenance: target.reservation.onward.provenance,
                },
              ]
            : []),
          { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: onward.matchUpId },
        ]
      : []),
  ];
}
