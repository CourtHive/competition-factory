import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { buildSideExitProvenance, collapseDoubleExitStatus } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { SINGLE_EXITS, indexed, onwardFrom, pairedFeeder } from './planShared';
import { producedConvergedOps, producedConvergedReason } from './convergence';
import { isDoubleExit } from '@Validators/isExit';
import { producedTarget } from './producedTarget';

// constants and types
import type { AbstainReason, DirectionPlan, MatchUpWrite, OutcomeRequest, OutcomeView, SeatObligation } from '../types';
import type { MatchUpStatusUnion, SideExitProvenance } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { OutcomeOp } from '../ops';
import {
  BYE,
  COMPLETED,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  IN_PROGRESS,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

/**
 * What a double exit produces in the next matchUp (S5, S7): pending or awarded, beside a fed seat, past a BYE-held
 * matchUp, converging past the BYE, as v1's `doubleExitAdvancement` and `advanceByeAdvancedDrawPosition` write it.
 */

/**
 * S5: a double exit entered on a matchUp holding no result, in a structure it links nothing out of, whose next matchUp
 * receives the exit it produces (`doubleExitAdvancement`: a DOUBLE_WALKOVER produces a WALKOVER, a DOUBLE_DEFAULT a
 * DEFAULTED, on the side the double exit feeds). Planned where the next matchUp is to be played and holds no result,
 * BYE, exit, codes or provenance, and links no loser on, in two shapes:
 *  - PENDING: nobody stands on the side it would be awarded to, so it is written with no winner (CA, 2026-09-20) and
 *    directs nothing, and the matchUp beside this one is still to be played, so its provenance records this side alone;
 *  - AWARDED: the winner of the matchUp beside this one stands there, so it is theirs at once and they go on into a clean
 *    next matchUp (`directWinner`), and their origin is recorded beside this one's (`buildSideExitProvenance`).
 * Beside a loser link from this matchUp or from the next, either shape is planned with the BYEs those seats take
 * (`doubleExitSeats`), outside a feed round. An award in the structure's final goes nowhere: the produced exit's write is
 * all there is. Abstained: a convergence, a BYE on the awarded side, an awarded winner with nowhere clean to go on to,
 * and a loser seat `doubleExitSeats` does not plan.
 */
export function producedReason(
  view: OutcomeView,
  request: OutcomeRequest,
  direction?: DirectionPlan,
  write?: MatchUpWrite,
): AbstainReason | SeatObligation | undefined {
  const { existing, targets } = view;
  if (!write || !isDoubleExit(write.matchUpStatus) || request.matchUpStatus !== write.matchUpStatus) return 'exit';
  // a matchUp in progress takes the double exit as one to be played does: v1 writes over its score (a dual's tally),
  // leaving a dual's played lines as they stand (S7)
  const open = existing.matchUpStatus === TO_BE_PLAYED || existing.matchUpStatus === IN_PROGRESS;
  if (!open || existing.winningSide || write.matchUpStatusCodes?.length) return 'exit';
  if (targets.byeTarget) return 'exit';
  // a round robin group's matchUp sends nobody on (`doubleExitAdvancement` returns at once in a container): its result
  // and the group's tally are all there is
  if (view.group && !view.group.adHoc && !direction && !targets.winnerMatchUpId && !targets.loserMatchUpId)
    return undefined;
  // the exit it produces meets one standing there: the two converge, and that double exit produces on
  if (direction?.converged) return producedConvergedReason(view, request, write, direction) ? undefined : 'exit';
  // a structure's final (or the one matchUp of a one-round structure) produces nothing (`doubleExitAdvancement` finds no
  // winner target): the own loser seat's BYE where a link feeds one, and the call's own write (S6 tail, family 8). A
  // final whose winner link leads on (DOUBLE_ELIMINATION's Decider) has a winner target across it: the decider's, v1's
  if (!targets.winnerMatchUpId && !direction?.decider) return { kind: 'double-exit-seats' };
  const produced = direction?.produced;
  const target = targets.winner;
  if (!produced || direction?.decider || !target) return 'exit';
  // the next matchUp holds a BYE on the side the exit is awarded to: the exit passes it (`byeHeldProduced`)
  const source = { matchUpId: request.matchUpId as string, matchUpStatus: write.matchUpStatus as MatchUpStatusUnion };
  if (target.hasBye) return byeHeldProduced(view, produced, source) ? undefined : 'exit';
  if (target.matchUpStatus !== TO_BE_PLAYED || target.holdsResult || target.hasBye || target.carriesExit) return 'exit';
  if (target.carriedStatuses.length) return 'exit';
  const entry = indexed(view, produced.matchUpId);
  if (!entry || entry.matchUpStatusCodes?.length || Object.keys(entry.sideExitProvenance ?? {}).length) return 'exit';
  const awarded = entry.sides?.find((side) => side.sideNumber === produced.winningSide);
  if (awarded?.bye) return 'exit';
  // loser links, from this matchUp or from the next: the seats they feed take BYEs, planned outside a feed round
  if (targets.loserLink || targets.loserMatchUpId || entry.loserMatchUpId) {
    if (entry.feedRound) return 'exit';
    return (
      pendingOrAwardedReason(view, entry, awarded) ?? {
        kind: 'double-exit-seats',
        targetMatchUpId: entry.matchUpId,
      }
    );
  }
  // a feed round: the awarded side is the fed seat, filled from another structure
  if (entry.feedRound) return fedSeatReason(view, entry, awarded);
  return pendingOrAwardedReason(view, entry, awarded);
}

type ByeHeldPassage = {
  beyond?: HydratedMatchUp;
  arrivalSide?: 1 | 2;
  relays: { matchUpId: string; sideNumber: 1 | 2 }[];
  /** the opponent standing beyond, awarded the exit, whose position goes on into the clean matchUp after */
  onward?: { matchUpId: string; drawPositions: number[] };
  /** the exit beyond met one standing there: the double exits it makes, level by level, and where the last produces */
  converged?: ConvergedChain;
};

type ChainLevel = {
  matchUpId: string;
  matchUpStatus: MatchUpStatusUnion;
  sideNumber: 1 | 2;
  /** the matchUp whose exit arrives, and what it was: the call's double exit, then each converged level */
  sourceMatchUpId: string;
  sourceMatchUpStatus: MatchUpStatusUnion;
};
type ConvergedChain = { levels: ChainLevel[]; pending?: ChainLevel };

const cleanBeyond = (matchUp: HydratedMatchUp) =>
  !matchUp.loserMatchUpId &&
  !matchUp.matchUpStatusCodes?.length &&
  !(matchUp.drawPositions ?? []).some(Boolean) &&
  !matchUp.sides?.some((side) => side.participantId || side.bye);

/**
 * S7: a produced exit arriving past a BYE where a produced exit stands pending on the other side: the two converge
 * (`collapseDoubleExitStatus`), and that double exit produces on (v1's `doubleExitAdvancement` again), into a clean
 * matchUp where it stands pending, or into another pending exit, converging again, to the structure's end. Each level is
 * recorded on the side its exit arrives at, its source the matchUp that exit came from. Undefined where anything else
 * stands there (a participant, a position, a loser link, a result, codes, provenance on the arrival side).
 */
function producedChain(view: OutcomeView, first: HydratedMatchUp, arrival: ChainLevel): ConvergedChain | undefined {
  const levels: ChainLevel[] = [];
  let at = first;
  let incoming = arrival;
  for (let hop = 0; hop < 8; hop += 1) {
    const provenance = at.sideExitProvenance ?? {};
    const standing = provenance[(3 - incoming.sideNumber) as 1 | 2];
    // a pending exit (no winner); a RETIRED always has one
    if (!SINGLE_EXITS.has(at.matchUpStatus) || at.winningSide) return undefined;
    // the exit standing there was produced by a double exit (a carried one converges by its own rule)
    if (!standing || !isDoubleExit(standing.previousMatchUpStatus)) return undefined;
    if (!cleanBeyond(at)) return undefined;
    const matchUpStatus = collapseDoubleExitStatus([incoming.matchUpStatus, at.matchUpStatus]);
    levels.push({ ...incoming, matchUpId: at.matchUpId, matchUpStatus });
    if (!at.winnerMatchUpId) return { levels };
    const target = producedTarget(view, at, matchUpStatus);
    const next = target?.entry;
    if (!target || target.feed || !next || !cleanBeyond(next)) return undefined;
    incoming = {
      matchUpId: next.matchUpId,
      matchUpStatus: target.matchUpStatus,
      sideNumber: target.fedSide,
      sourceMatchUpId: at.matchUpId,
      sourceMatchUpStatus: matchUpStatus,
    };
    if (next.matchUpStatus === TO_BE_PLAYED && !next.winningSide && !next.score?.scoreStringSide1) {
      if (Object.keys(next.sideExitProvenance ?? {}).length) return undefined;
      return { levels, pending: incoming };
    }
    at = next;
  }
  return undefined;
}

/** Convergence past the first BYE; a pending exit after a longer walk remains outside this rule. */
function firstPendingExit(matchUp: HydratedMatchUp, relays: ByeHeldPassage['relays']): boolean {
  return SINGLE_EXITS.has(matchUp.matchUpStatus) && !relays.length;
}

/**
 * S7: a double exit whose next matchUp holds a BYE on the side its produced exit is awarded to (a consolation feed round
 * whose fed seat took a BYE, or a plain round's double BYE). v1 leaves that matchUp a BYE: it records the produced exit
 * beside its BYE, on the side the double exit feeds (in a plain round the BYE's own origin, the matchUp beside, too), and
 * sends the exit on (`advanceByeAdvancedDrawPosition`) into the matchUp beyond, where it stands PENDING, no winner,
 * recorded on the side that BYE matchUp feeds; the BYE's position is not advanced. The two writes keep the codes their
 * policy keeps (`[]`), the score beyond blanked; the matchUp beyond is announced with neither event nor tournament.
 * Planned where nothing links a loser on and the matchUp beyond is to be played in a plain round of the same structure,
 * holding no result, score, BYE or loser link and nobody on the side the exit arrives at: a position nobody has reached
 * may stand on the other side (the exit pending), or an opponent, straight past the first BYE, who is awarded the exit
 * and goes on into a clean matchUp, announced `advanceWinner` with neither event nor tournament, or a produced exit
 * pending there, with which it converges (`producedChain`). Anything else (a position or an exit already beyond, a BYE there
 * too) is v1's; the settle passes' predicates catch those shapes as well (falsified, O13).
 */
function byeHeldProduced(
  view: OutcomeView,
  produced: NonNullable<DirectionPlan['produced']>,
  source: { matchUpId: string; matchUpStatus: MatchUpStatusUnion },
): ByeHeldPassage | undefined {
  const { targets } = view;
  if (targets.loserLink || targets.loserMatchUpId) return undefined;
  // the BYE matchUp's own loser link takes a BYE in v1 (`advanceByeToLoserMatchUp`), which is not planned
  const held = indexed(view, produced.matchUpId);
  if (!held || held.loserMatchUpId) return undefined;
  const relays: { matchUpId: string; sideNumber: 1 | 2 }[] = [];
  let from: HydratedMatchUp = held;
  // v1 carries the exit on (`carryExitOnward`) through BYE-held matchUps beyond, each left a BYE, to the first that is
  // not, or to the structure's end; each matchUp is visited once
  for (let hop = 0; hop < 8; hop += 1) {
    if (!from.winnerMatchUpId) return { relays };
    const target = producedTarget(view, from, produced.matchUpStatus === DEFAULTED ? DOUBLE_DEFAULT : undefined);
    const beyond = target?.entry;
    if (!target || target.feed || !beyond || beyond.loserMatchUpId) return undefined;
    if (beyond.matchUpStatus === BYE) {
      if (beyond.winningSide || beyond.sides?.some((side) => side.participantId)) return undefined;
      relays.push({ matchUpId: beyond.matchUpId, sideNumber: target.fedSide });
      from = beyond;
      continue;
    }
    // a pending exit standing beyond: the two converge, straight past the first BYE (S7)
    if (firstPendingExit(beyond, relays)) {
      const converged = producedChain(view, beyond, {
        matchUpId: beyond.matchUpId,
        matchUpStatus: produced.matchUpStatus,
        sideNumber: target.fedSide,
        sourceMatchUpId: source.matchUpId,
        sourceMatchUpStatus: source.matchUpStatus,
      });
      return converged ? { relays, converged } : undefined;
    }
    if (beyond.matchUpStatus !== TO_BE_PLAYED || beyond.winningSide || beyond.score?.scoreStringSide1) return undefined;
    // a position nobody has reached may stand on the other side (fed there structurally); the arrival side is empty
    const arrival = beyond.sides?.find((side) => side.sideNumber === target.fedSide);
    if (arrival?.drawPosition || arrival?.participantId) return undefined;
    const opponent = beyond.sides?.find((side) => side.sideNumber !== target.fedSide && side.participantId);
    if (!opponent) return { beyond, arrivalSide: target.fedSide, relays };
    // an opponent standing there is awarded the exit at once and goes on into a clean matchUp (straight past the first
    // BYE only: `advanceByeAdvancedDrawPosition`'s award)
    const onward =
      !relays.length && opponent.drawPosition ? onwardFrom(view, beyond, opponent.drawPosition) : undefined;
    return onward ? { beyond, arrivalSide: target.fedSide, relays, onward } : undefined;
  }
  return undefined;
}

/**
 * The converged chain's writes (`producedChain`): each level the double exit the two exits make, codes `[]`, the arriving
 * exit recorded on its side; the first announced with neither event nor tournament (`advanceByeAdvancedDrawPosition`),
 * the rest with both (`doubleExitAdvancement`). Then the exit the last produces, pending in the clean matchUp after.
 */
function chainOps({ levels, pending }: ConvergedChain): OutcomeOp[] {
  const recorded = (level: ChainLevel): OutcomeOp[] => {
    const provenance = buildSideExitProvenance({
      sourceMatchUpStatus: level.sourceMatchUpStatus,
      sourceMatchUpId: level.sourceMatchUpId,
      sourceSideNumber: level.sideNumber,
    });
    return provenance ? [{ op: 'mergeSideExitProvenance', matchUpId: level.matchUpId, provenance }] : [];
  };
  const written = (level: ChainLevel, quiet: boolean, blanked?: boolean): OutcomeOp[] => [
    {
      op: 'setMatchUpResult',
      matchUpId: level.matchUpId,
      matchUpStatus: level.matchUpStatus,
      matchUpStatusCodes: [],
      ...(blanked ? { resetsScore: true, score: toBePlayed.score } : {}),
      stampsScoredTime: false,
      ...(quiet ? { announcesContext: false as const } : {}),
    },
    ...recorded(level),
    { op: 'stampUpdatedAt', entity: 'matchUp', id: level.matchUpId },
  ];
  // v1's modifyMatchUpScore blanks every DOUBLE_WALKOVER, including a previously scoreless convergence
  // (census on:20498521). Defaults retain their score; the produced WALKOVER's score is blanked as well.
  const pendingOps = pending ? written(pending, false, pending.matchUpStatus === WALKOVER) : [];
  return [
    ...levels.flatMap((level, i) => written(level, i === 0, level.matchUpStatus === DOUBLE_WALKOVER)),
    ...pendingOps,
  ];
}

/** the produced exit past a BYE-held next matchUp, as v1 writes it (`byeHeldProduced`) */
function byeHeldProducedOps(
  view: OutcomeView,
  request: OutcomeRequest,
  write: MatchUpWrite,
  produced: NonNullable<DirectionPlan['produced']>,
): OutcomeOp[] {
  const source = { matchUpId: request.matchUpId as string, matchUpStatus: write.matchUpStatus as MatchUpStatusUnion };
  const passage = byeHeldProduced(view, produced, source);
  if (!passage) return [];
  const { beyond, arrivalSide, relays, onward, converged } = passage;
  // in a plain round the BYE came from the matchUp beside this one (a double BYE): its origin is recorded too
  const paired = indexed(view, produced.matchUpId)?.feedRound ? undefined : pairedFeeder(view);
  const recorded = (matchUpId: string, sourceSideNumber: 1 | 2, withPaired?: boolean): OutcomeOp[] => {
    const provenance = buildSideExitProvenance({
      sourceMatchUpStatus: write.matchUpStatus as MatchUpStatusUnion,
      sourceMatchUpId: request.matchUpId,
      sourceSideNumber,
      ...(withPaired && paired ? { pairedMatchUpStatus: paired.matchUpStatus, pairedMatchUpId: paired.matchUpId } : {}),
    });
    return provenance ? [{ op: 'mergeSideExitProvenance', matchUpId, provenance }] : [];
  };
  // the exit lands PENDING in the first matchUp past the BYEs: announced with neither event nor tournament where it lands
  // straight past the first BYE (`advanceByeAdvancedDrawPosition`); with both past a BYE beyond it (`carryExitOnward`),
  // its matchUp in context read without the tournament
  const landedOps = (matchUpId: string, sideNumber: 1 | 2): OutcomeOp[] => [
    {
      op: 'setMatchUpResult',
      matchUpId,
      matchUpStatus: produced.matchUpStatus,
      ...(onward ? { winningSide: (3 - sideNumber) as 1 | 2 } : {}),
      matchUpStatusCodes: [],
      // v1's writer here removes the score whatever the exit (`removeScore`), leaving it blanked
      resetsScore: true,
      score: toBePlayed.score,
      stampsScoredTime: false,
      ...(relays.length ? { inContextBare: true as const } : { announcesContext: false as const }),
    },
    ...recorded(matchUpId, sideNumber),
    { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
    // the awardee's position goes on, announced as `advanceWinner` with neither event nor tournament
    ...(onward
      ? [
          {
            op: 'setMatchUpDrawPositions' as const,
            matchUpId: onward.matchUpId,
            drawPositions: onward.drawPositions,
            advancesThroughBye: true as const,
            announcesContext: false as const,
          },
          { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: onward.matchUpId },
        ]
      : []),
  ];
  return [
    {
      op: 'setMatchUpResult',
      matchUpId: produced.matchUpId,
      matchUpStatus: BYE,
      matchUpStatusCodes: [],
      stampsScoredTime: false,
    },
    ...recorded(produced.matchUpId, (3 - produced.winningSide) as 1 | 2, true),
    { op: 'stampUpdatedAt', entity: 'matchUp', id: produced.matchUpId },
    // each BYE-held matchUp passed stays a BYE and records the exit on the side it arrives at
    ...relays.flatMap(({ matchUpId, sideNumber }): OutcomeOp[] => [
      {
        op: 'setMatchUpResult',
        matchUpId,
        matchUpStatus: BYE,
        matchUpStatusCodes: [],
        resetsScore: true,
        score: toBePlayed.score,
        stampsScoredTime: false,
        announcesContext: false,
      },
      ...recorded(matchUpId, sideNumber),
      { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
    ]),
    ...(beyond && arrivalSide ? landedOps(beyond.matchUpId, arrivalSide) : []),
    ...(converged ? chainOps(converged) : []),
  ];
}

/**
 * Outside a feed round the produced exit is PENDING where nobody stands on the side it is awarded to and the feeder beside
 * this one is still to be played, or AWARDED where that feeder delivered its winner there (a played result, a single
 * exit or a BYE), who goes on into a clean next matchUp. A seat holding a position nobody has reached is not planned.
 */
function pendingOrAwardedReason(
  view: OutcomeView,
  entry: HydratedMatchUp,
  awarded?: { participantId?: string; drawPosition?: number },
): AbstainReason | undefined {
  const paired = pairedFeeder(view);
  if (!awarded?.participantId) {
    if (awarded?.drawPosition) return 'exit';
    return paired?.matchUpStatus === TO_BE_PLAYED ? undefined : 'exit';
  }
  // delivered by a played result or a single exit, or through a BYE (whose origin v1 records as the BYE)
  const delivered =
    paired?.matchUpStatus === BYE || (!!paired?.winningSide && DELIVERED_FEEDS.has(paired.matchUpStatus));
  if (!delivered) return 'exit';
  if (!awarded.drawPosition) return 'exit';
  // awarded in the structure's final: the awardee wins it and goes nowhere (`directWinner` finds no winner target), so
  // the produced exit's write is all there is. A final whose winner links out has a winner target across the link
  if (!entry.winnerMatchUpId) return undefined;
  return onwardFrom(view, entry, awarded.drawPosition) ? undefined : 'exit';
}

/** a feeder's results whose winner standing in the seat it feeds is an origin v1 records as it is (`deliveredStatus`) */
const DELIVERED_FEEDS = new Set<string | undefined>([COMPLETED, ...SINGLE_EXITS]);

/**
 * A produced exit in a FEED ROUND, beside the fed seat. Planned where that seat holds a position nobody has reached yet:
 * the exit stands pending for whoever arrives there, and v1 advances the EMPTY position into the next matchUp ahead of
 * them (a reservation for the arrival, `doubleExitAdvancement`), into a clean one only. A fed seat already filled (the
 * award and its onward direction) or holding no position is v1's.
 */
function fedSeatReason(
  view: OutcomeView,
  entry: HydratedMatchUp,
  awarded?: { participantId?: string; drawPosition?: number },
): AbstainReason | undefined {
  if (awarded?.participantId || !awarded?.drawPosition) return 'exit';
  return onwardFrom(view, entry, awarded.drawPosition) ? undefined : 'exit';
}

/**
 * The produced exit's write on the next matchUp, as v1's `doubleExitAdvancement` makes it there: the status, no winner,
 * the policy codes it keeps (`[]`), a WALKOVER's score blanked, then the side the double exit feeds given its origin
 * (`buildSideExitProvenance`, v1's own builder). Announced as the score write it is.
 */
function producedOps(view: OutcomeView, request: OutcomeRequest, write: MatchUpWrite, direction?: DirectionPlan) {
  const produced = direction?.produced;
  if (!produced) return [];
  if (view.targets.winner?.hasBye) return byeHeldProducedOps(view, request, write, produced);
  const entry = indexed(view, produced.matchUpId);
  const awarded = entry?.sides?.find((side) => side.sideNumber === produced.winningSide);
  const paired = awarded?.participantId && !entry?.feedRound ? pairedFeeder(view) : undefined;
  // awarded at once to the paired feeder's winner standing there, or in a feed round the fed seat's empty position
  // advanced ahead of the arrival it awaits (a reservation)
  const reserving = !!entry?.feedRound && !awarded?.participantId;
  const onward =
    entry && (paired || reserving) && awarded?.drawPosition ? onwardFrom(view, entry, awarded.drawPosition) : undefined;
  const provenance = buildSideExitProvenance({
    sourceMatchUpStatus: write.matchUpStatus as MatchUpStatusUnion,
    sourceSideNumber: 3 - produced.winningSide,
    sourceMatchUpId: request.matchUpId,
    // the opponent standing there arrived from the feeder beside this one: its origin is recorded too
    ...(paired ? { pairedMatchUpStatus: paired.matchUpStatus, pairedMatchUpId: paired.matchUpId } : {}),
  });
  return producedAwardWriteOps(
    produced.matchUpId,
    produced.matchUpStatus,
    paired ? produced.winningSide : undefined,
    provenance,
    onward,
  );
}

/** The real produced score writer and its ordinary award's forward placement. */
export function producedAwardWriteOps(
  matchUpId: string,
  matchUpStatus: MatchUpStatusUnion,
  winningSide: 1 | 2 | undefined,
  provenance: SideExitProvenance | undefined,
  onward?: { matchUpId: string; drawPositions: number[] },
): OutcomeOp[] {
  return [
    {
      op: 'setMatchUpResult',
      matchUpId,
      matchUpStatus,
      ...(winningSide ? { winningSide } : {}),
      matchUpStatusCodes: [],
      stampsScoredTime: false,
      ...(matchUpStatus === WALKOVER ? { resetsScore: true, score: toBePlayed.score } : {}),
    },
    ...(provenance ? [{ op: 'mergeSideExitProvenance' as const, matchUpId, provenance }] : []),
    { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
    ...(onward
      ? [
          {
            op: 'setMatchUpDrawPositions' as const,
            matchUpId: onward.matchUpId,
            drawPositions: onward.drawPositions,
            announcesContext: false as const,
          },
          { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: onward.matchUpId },
        ]
      : []),
  ];
}

/** what a double exit produces in the next matchUp: an exit there, or a convergence with the one standing there */
export function producedExitOps(
  view: OutcomeView,
  request: OutcomeRequest,
  write: MatchUpWrite,
  direction?: DirectionPlan,
) {
  return direction?.converged
    ? producedConvergedOps(view, request, write, direction)
    : producedOps(view, request, write, direction);
}
