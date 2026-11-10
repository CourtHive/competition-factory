import { blankScore, indexed, positionsOf, scoreless, seatKey, sideOf, undecided, unwoundClean } from './planShared';
import { collapseDoubleExitStatus } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { carriedExitStatus } from '@Helpers/drawTopology/sideExitProvenance';
import { isDoubleExit } from '@Validators/isExit';

// constants and types
import { BYE, COMPLETED, DEFAULTED, DOUBLE_DEFAULT, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { MatchUpStatusUnion, SideExitProvenance } from '@Types/tournamentTypes';
import type { HydratedMatchUp, HydratedSide } from '@Types/hydrated';
import { FIRST_MATCHUP } from '@Constants/drawDefinitionConstants';
import type { OutcomeView, WinnerLoserSeat } from '../types';
import type { ProducedTarget } from './producedTarget';
import type { OutcomeOp } from '../ops';

/**
 * The seat programs of a cleared or re-decided double exit's unwind (S6, S7): the BYE withdrawn at each seat and what
 * it sent on taken back, the carrier a BYE sent on brought home, the relay copies a produced exit left behind each BYE,
 * the standing BYE, the double BYE and the round-one cascade.
 */

export type Rederived = { matchUpStatus: MatchUpStatusUnion; provenance: SideExitProvenance };

/**
 * S6 tail: the double exit's produced exit met its paired matchUp's in the next matchUp, which stands a double exit by
 * convergence (two origins, this matchUp's among them) producing on in turn. v1's unwind re-derives that matchUp to the
 * kept origin's pending exit (`getUnwoundState` under `pairedPreviousDoubleExit`: the status its retained provenance
 * derives, no winner, the score kept, codes re-derived), and its id joins the withdrawn origins, so what it produced
 * onward is taken back as any produced exit is: the next matchUp reset where that origin was its only one, re-derived in
 * turn where another stands beside it. The chain from the produced exit's matchUp to the first matchUp reset, or to a
 * final re-derived, each holding nothing but its origins: no winner, position, score or code. Undefined for anything
 * else.
 */
export function convergedChain(
  view: OutcomeView,
  source: HydratedMatchUp,
  target: Pick<ProducedTarget, 'entry'>,
): { matchUpId: string; rederived?: Rederived }[] | undefined {
  const chain: { matchUpId: string; rederived?: Rederived }[] = [];
  let previous: HydratedMatchUp | undefined = source;
  let matchUp: HydratedMatchUp | undefined = target.entry;
  while (matchUp && previous && chain.length <= (view.inContextDrawMatchUps?.length ?? 0)) {
    // a matchUp holding anyone records their arrival beside the exits (an awardee's entry carries no status), which the
    // kept side's read below refuses: the chain's matchUps hold nothing but their origins
    if (matchUp.matchUpStatusCodes?.length) return undefined;
    const provenance = matchUp.sideExitProvenance ?? {};
    const sides = ([1, 2] as const).filter((side) => provenance[side]);
    const previousId = previous.matchUpId;
    const withdrawnSide = sides.find((side) => provenance[side]?.sourceMatchUpId === previousId);
    if (!withdrawnSide || !carriedExitStatus(provenance[withdrawnSide])) return undefined;
    const [keptSide, ...keptMore] = sides.filter((side) => side !== withdrawnSide);
    if (!keptSide) {
      // the chain ends at the pending exit this unwind alone produced (its one origin, nothing else), written back to be
      // played (`unwoundOps`)
      chain.push({ matchUpId: matchUp.matchUpId });
      return chain.some((level) => level.rederived) ? chain : undefined;
    }
    // two sides: one origin withdrawn leaves one kept, whose carried exit the matchUp (a double exit by convergence)
    // re-derives to
    const keptEntry = keptMore.length ? undefined : provenance[keptSide];
    const matchUpStatus = carriedExitStatus(keptEntry);
    if (!keptEntry || !matchUpStatus) return undefined;
    chain.push({ matchUpId: matchUp.matchUpId, rederived: { matchUpStatus, provenance: { [keptSide]: keptEntry } } });
    previous = matchUp;
    matchUp = indexed(view, matchUp.winnerMatchUpId);
  }
  // a final re-derived produces nothing onward
  return !matchUp && chain.some((level) => level.rederived) ? chain : undefined;
}

type ClearMatchUpBye = Extract<OutcomeOp, { op: 'clearMatchUpBye' }>;

/**
 * The three ops every relay program opens with (Mentat assessment/2026-11-07-outcome-refactor-debates.md, ruling 2):
 * the seat's withdrawal, the BYE's home cleared and re-derived to the retained copy's status with the program's own
 * binding for the writer it hands the copy to, and the home's stamp. The programs stay apart; only this header is shared.
 */
function retainedHomeOps(
  bye: HydratedMatchUp,
  drawPosition: number,
  status: MatchUpStatusUnion,
  withdraw: OutcomeOp,
  binding: Partial<Pick<ClearMatchUpBye, 'retainedOnwardMatchUpId' | 'retainedCarriedAward'>> = {},
): OutcomeOp[] {
  return [
    withdraw,
    { op: 'clearMatchUpBye', matchUpId: bye.matchUpId, drawPosition, rederived: { matchUpStatus: status }, ...binding },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: bye.matchUpId },
  ];
}

/** An empty double-produced reservation reached this feed relay through exactly one standing BYE. Clear only. */
function indirectProducedRelaySeatOps(
  view: OutcomeView,
  seat: WinnerLoserSeat,
  bye: HydratedMatchUp,
  drawPosition: number,
  withdraw: OutcomeOp,
  withdrawn: Set<string>,
): OutcomeOp[] | undefined {
  if (view.draw.doubleExitPropagatesBye || bye.matchUpStatus !== BYE || bye.winningSide || !bye.feedRound)
    return undefined;
  if (bye.loserMatchUpId || !scoreless(bye) || bye.matchUpStatusCodes?.length || positionsOf(bye).length !== 2)
    return undefined;
  const [kept, ...more] = Object.values(bye.sideExitProvenance ?? {});
  const binding = seat.foreignProducedSeat;
  if (!kept || more.length || !binding || binding.linkCondition || binding.sourceMatchUpId !== kept.sourceMatchUpId)
    return undefined;
  const source = indexed(view, binding.sourceMatchUpId);
  const inter = indexed(view, binding.matchUpId);
  const status = carriedExitStatus(kept);
  if (!source || !inter || !status || !isDoubleExit(source.matchUpStatus) || source.winningSide) return undefined;
  if (source.matchUpStatus !== kept.previousMatchUpStatus || !scoreless(source) || source.matchUpStatusCodes?.length)
    return undefined;
  if (source.winnerMatchUpId === bye.matchUpId || source.loserMatchUpId !== inter.matchUpId) return undefined;
  if (
    binding.structureId !== bye.structureId ||
    inter.structureId !== bye.structureId ||
    inter.winnerMatchUpId !== bye.matchUpId
  )
    return undefined;
  if (
    inter.loserMatchUpId ||
    inter.matchUpStatus !== BYE ||
    inter.winningSide ||
    !scoreless(inter) ||
    inter.matchUpStatusCodes?.length
  )
    return undefined;
  const reservation = binding.drawPosition;
  if (positionsOf(inter).length !== 2 || !positionsOf(inter).includes(reservation)) return undefined;
  if (inter.sides?.some((side) => side.participantId || side.qualifier)) return undefined;
  if (Object.keys(source.sideExitProvenance ?? {}).length) return undefined;
  if (inter.sideExitProvenance?.[sideOf(inter, reservation) ?? 0]?.sourceMatchUpId !== source.matchUpId)
    return undefined;
  const carrier = inter.sides?.find((side) => side.drawPosition === reservation);
  const standing = inter.sides?.find((side) => side.drawPosition !== reservation && side.bye);
  if (!carrier || carrier.participantId || carrier.bye || carrier.qualifier || !standing?.drawPosition)
    return undefined;
  if (withdrawn.has(seatKey({ structureId: inter.structureId, drawPosition: standing.drawPosition }))) return undefined;
  const interEntries = Object.values(inter.sideExitProvenance ?? {});
  if (interEntries.length !== 1 || JSON.stringify(interEntries[0]) !== JSON.stringify(kept)) return undefined;
  if (reservation === drawPosition || !positionsOf(bye).includes(reservation)) return undefined;
  const relayCarrier = bye.sides?.find((side) => side.drawPosition === reservation);
  if (!relayCarrier || relayCarrier.participantId || relayCarrier.bye || relayCarrier.qualifier) return undefined;
  if (bye.sideExitProvenance?.[sideOf(bye, reservation) ?? 0] !== kept) return undefined;
  const next = indexed(view, bye.winnerMatchUpId);
  if (
    !next ||
    next.structureId !== bye.structureId ||
    next.loserMatchUpId ||
    next.matchUpStatus !== status ||
    !next.winningSide
  )
    return undefined;
  if (!scoreless(next) || next.matchUpStatusCodes?.length || positionsOf(next).length !== 2) return undefined;
  const winner = next.sides?.find((side) => side.sideNumber === next.winningSide);
  if (!winner?.participantId || !winner.drawPosition || winner.drawPosition === reservation) return undefined;
  const nextEntries = Object.values(next.sideExitProvenance ?? {});
  if (nextEntries.length !== 1 || JSON.stringify(nextEntries[0]) !== JSON.stringify(kept)) return undefined;
  if (next.sideExitProvenance?.[sideOf(next, reservation) ?? 0]?.sourceMatchUpId !== source.matchUpId) return undefined;
  const successor = indexed(view, next.winnerMatchUpId);
  if (
    !successor ||
    successor.structureId !== bye.structureId ||
    successor.loserMatchUpId ||
    successor.winningSide ||
    !unwoundClean(successor, withdrawn)
  )
    return undefined;
  if (!positionsOf(successor).includes(winner.drawPosition) || positionsOf(successor).length !== 2) return undefined;
  const beyond = indexed(view, successor.winnerMatchUpId);
  if (beyond && (beyond.structureId !== bye.structureId || positionsOf(beyond).includes(winner.drawPosition)))
    return undefined;
  return [
    ...retainedHomeOps(bye, drawPosition, status, withdraw),
    {
      op: 'setMatchUpDrawPositions',
      matchUpId: successor.matchUpId,
      drawPositions: positionsOf(successor).filter((position) => position !== winner.drawPosition),
      releasedDrawPosition: winner.drawPosition,
      announcesContext: false,
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: successor.matchUpId },
    {
      op: 'setMatchUpDrawPositions',
      matchUpId: next.matchUpId,
      drawPositions: [winner.drawPosition],
      withdrawnByePosition: drawPosition,
      withdrawsProducedExit: true,
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId },
  ];
}

/**
 * Under `doubleExitPropagateBye: false`, what the deeper seats' withdrawals leave for the own seat's passage to read
 * (`unwoundPassage`, S7): the BYE matchUps they wrote back to be played (`cleared`), and the matchUps whose pending exit
 * went with the position taken out (`reset`), as v1's chain finds them once the unfillable seat's BYE has gone
 */
export type UnwindRelay = { sourceId: string; cleared: Set<string>; reset: Set<string>; retained: Map<string, string> };

// `carriedBesideBye` with `carriedOpposite` and `carrierSentOn` read a participant's carried exit beside the
// withdrawn BYE; `producedBesideBye` reads a double exit's produced copy there. They share seven predicates and the
// kind test `isDoubleExit(entry.previousMatchUpStatus)` (as v1's `carriedEntryAt` and `awardStands` read it), which
// is the one read to be hoisted (Mentat assessment/2026-11-07-outcome-refactor-debates.md, ruling 12). The read ends
// there. `producedBesideBye`'s walls (feed round, one position, no loser link, a live origin feeding this matchUp
// directly) belong to the five direct programs, not to the kind: `indirectProducedRelaySeatOps` owns a produced copy
// beside a two-position BYE fed indirectly, and a loser link is tolerated here yet refused by `carrierSentOn`. The
// onward paths are never shared: the carry walks the carrier's position through BYE relays; the copy is read one hop
// by source id, and `producedRelayAfterOps` recomputes that hop from the home.
/**
 * A participant's carried exit standing beside the BYE in the structure's last round (S7): the one provenance entry, on
 * the side opposite the BYE's, a carried exit a participant brought (not a double exit's produced one), the matchUp a
 * BYE with no winner, score or codes, and no next matchUp (the carrier passed nothing on). Once the BYE goes, v1
 * re-derives the matchUp to that exit, awarded to the side without it, as `updateMatchUpStatusAfterRemoval` does;
 * a BYE matchUp with a next matchUp sent the carrier on, and taking them back is v1's. Returns the re-derived state.
 */
function carriedBesideBye(
  byeMatchUp: HydratedMatchUp,
  drawPosition: number,
): { matchUpStatus: MatchUpStatusUnion; winningSide: 1 | 2 } | undefined {
  return byeMatchUp.winnerMatchUpId ? undefined : carriedOpposite(byeMatchUp, drawPosition);
}

/**
 * A participant's carried exit on the side opposite `drawPosition` in a BYE matchUp holding nothing else of a result
 * (`carriedBesideBye`, `carrierSentOn`): the exit's status, and the side holding `drawPosition`, which wins it
 */
function carriedOpposite(
  byeMatchUp: HydratedMatchUp,
  drawPosition: number,
): { matchUpStatus: MatchUpStatusUnion; winningSide: 1 | 2 } | undefined {
  if (byeMatchUp.matchUpStatus !== BYE || byeMatchUp.winningSide) return undefined;
  if (!scoreless(byeMatchUp) || byeMatchUp.matchUpStatusCodes?.length) return undefined;
  const byeSide = byeMatchUp.sides?.find((side) => side.drawPosition === drawPosition)?.sideNumber;
  if (byeSide !== 1 && byeSide !== 2) return undefined;
  const entries = Object.entries(byeMatchUp.sideExitProvenance ?? {});
  const [kept, ...more] = entries;
  if (!kept || more.length || Number(kept[0]) !== 3 - byeSide) return undefined;
  const matchUpStatus = carriedExitStatus(kept[1]);
  if (!matchUpStatus || isDoubleExit(kept[1]?.previousMatchUpStatus)) return undefined;
  return { matchUpStatus, winningSide: byeSide };
}

/**
 * The carrier a withdrawn BYE had sent on (S7): a participant's carried exit beside the BYE, whose BYE matchUp has a
 * next matchUp. The BYE advanced the carrier on, past each matchUp another standing BYE holds (a relay: the carry
 * recorded beside that BYE, RULE 1), to the landing where the carry stands pending over an empty seat (RULE 2: the
 * carried status, the side opposite the carrier winning, scoreless, no codes, the carry its one entry), the award having
 * sent nobody on but the participant beside the carrier, if one stands there. When the BYE goes, v1 re-derives the BYE matchUp to the carry
 * (`updateMatchUpStatusAfterRemoval`), releases the carrier out of every round the BYE moved them through
 * (`releaseAdvancedDrawPosition`: the position, the carry with it, `withdrawRelayedExit`; `bringCarryHome` finds the
 * carry recorded beside the BYE already), the relays still BYEs, the landing to be played, its `scoredTime` taken by the
 * pass that announces it (`reconcileScoredTimes`); a participant the award had sent on (RULE 3) is taken back out of the
 * matchUp beyond, to be played with nothing else of a result. A carrier the BYE matchUp or a relay would link on as its
 * loser, an awardee sent further, another entry, a result, a relay's BYE this unwind withdraws: v1's.
 */
function carrierSentOn(
  view: OutcomeView,
  byeMatchUp: HydratedMatchUp,
  drawPosition: number,
  withdrawn: Set<string>,
): CarrierSentOn | undefined {
  const rederived = carriedOpposite(byeMatchUp, drawPosition);
  const side = byeMatchUp.sides?.find((candidate) => candidate.drawPosition !== drawPosition);
  if (!rederived || !side?.participantId || !side.drawPosition || byeMatchUp.loserMatchUpId) return undefined;
  const carrier = side.drawPosition;
  const [entry] = Object.values(byeMatchUp.sideExitProvenance ?? {});
  const sideOfCarrier = (at: HydratedMatchUp) =>
    at.sides?.find((candidate) => candidate.drawPosition === carrier)?.sideNumber;
  // the carry as each matchUp the carrier passed through records it: its one entry, on the carrier's side, the same exit
  // from the same source, nothing else of a result there, in this structure, no loser link out
  const carries = (at: HydratedMatchUp): boolean => {
    const [carried, ...more] = Object.entries(at.sideExitProvenance ?? {});
    if (!carried || more.length || Number(carried[0]) !== sideOfCarrier(at)) return false;
    if (carried[1]?.sourceMatchUpId !== entry?.sourceMatchUpId) return false;
    if (carriedExitStatus(carried[1]) !== rederived.matchUpStatus) return false;
    return (
      scoreless(at) && !at.matchUpStatusCodes?.length && at.structureId === byeMatchUp.structureId && !at.loserMatchUpId
    );
  };
  const relays: HydratedMatchUp[] = [];
  let at = indexed(view, byeMatchUp.winnerMatchUpId);
  while (at && at.matchUpStatus === BYE && relays.length < 8) {
    if (!carries(at) || at.winningSide) return undefined;
    const standing = at.sides?.find((candidate) => candidate.bye);
    if (
      !standing?.drawPosition ||
      withdrawn.has(seatKey({ structureId: at.structureId, drawPosition: standing.drawPosition }))
    )
      return undefined;
    relays.push(at);
    at = indexed(view, at.winnerMatchUpId);
  }
  const carrierSide = at ? sideOfCarrier(at) : undefined;
  if (!at || (carrierSide !== 1 && carrierSide !== 2) || !carries(at)) return undefined;
  if (at.matchUpStatus !== rederived.matchUpStatus || at.winningSide !== 3 - carrierSide) return undefined;
  const awardee = at.sides?.find((candidate) => candidate.sideNumber !== carrierSide);
  if (awardee?.bye) return undefined;
  const beyond = indexed(view, at.winnerMatchUpId);
  // the award sent the participant beside the carrier on (RULE 3): v1 takes them back out of the matchUp beyond, which
  // holds nothing else of a result and sent them no further (`releaseAdvancedDrawPosition`); an empty seat sent nobody
  const sent = awardee?.participantId && beyond && positionsOf(beyond).includes(awardee.drawPosition ?? 0);
  if (
    beyond &&
    positionsOf(at).some(
      (position) => (!sent || position !== awardee.drawPosition) && positionsOf(beyond).includes(position),
    )
  )
    return undefined;
  if (awardee?.participantId && !sent && beyond) return undefined;
  if (!sent) return { rederived, carrier, relays, landing: at };
  if (beyond.matchUpStatus !== TO_BE_PLAYED || beyond.winningSide || !scoreless(beyond)) return undefined;
  if (beyond.matchUpStatusCodes?.length || Object.keys(beyond.sideExitProvenance ?? {}).length) return undefined;
  const further = indexed(view, beyond.winnerMatchUpId);
  if (further && positionsOf(further).includes(awardee.drawPosition ?? 0)) return undefined;
  return {
    rederived,
    carrier,
    relays,
    landing: at,
    released: { matchUp: beyond, drawPosition: awardee.drawPosition ?? 0 },
  };
}

type CarrierSentOn = {
  rederived: { matchUpStatus: MatchUpStatusUnion; winningSide: 1 | 2 };
  carrier: number;
  relays: HydratedMatchUp[];
  landing: HydratedMatchUp;
  /** the matchUp beyond the landing, holding the participant the award sent on: that position taken back out of it */
  released?: { matchUp: HydratedMatchUp; drawPosition: number };
};

/**
 * The carrier released out of every round the withdrawn BYE moved them through (`carrierSentOn`): the landing loses the
 * position and the carry and is to be played (`releaseAdvancedDrawPosition`, announced last by the settle pass that takes
 * its `scoredTime`); the awardee it sent on comes back out of the matchUp beyond; each relay, a BYE still, loses the
 * position and the carry, written as v1's position clear announces it after the release (`removeDrawPosition-<n>`, the
 * withdrawn BYE's)
 */
function carrierHomeOps({ carrier, relays, landing, released }: CarrierSentOn, drawPosition: number): OutcomeOp[] {
  const taken = (at: HydratedMatchUp) => positionsOf(at).filter((position) => position !== carrier);
  return [
    {
      op: 'setMatchUpDrawPositions',
      matchUpId: landing.matchUpId,
      drawPositions: taken(landing),
      releasedDrawPosition: carrier,
    },
    {
      op: 'setMatchUpResult',
      matchUpId: landing.matchUpId,
      matchUpStatus: TO_BE_PLAYED,
      announcedAs: 'reconcileScoredTimes',
    },
    { op: 'setSideExitProvenance', matchUpId: landing.matchUpId },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: landing.matchUpId },
    // the awardee taken back out of the matchUp beyond: announced as the release, with neither event nor tournament
    ...(released
      ? [
          {
            op: 'setMatchUpDrawPositions' as const,
            matchUpId: released.matchUp.matchUpId,
            drawPositions: positionsOf(released.matchUp).filter((position) => position !== released.drawPosition),
            releasedDrawPosition: released.drawPosition,
            announcesContext: false as const,
          },
          { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: released.matchUp.matchUpId },
        ]
      : []),
    // the relays last: v1's position clear rewrites each after the release, and its notice is the one kept
    ...relays.flatMap((relay): OutcomeOp[] => [
      {
        op: 'setMatchUpDrawPositions',
        matchUpId: relay.matchUpId,
        drawPositions: taken(relay),
        withdrawnByePosition: drawPosition,
      },
      { op: 'setSideExitProvenance', matchUpId: relay.matchUpId },
      { op: 'stampUpdatedAt', entity: 'matchUp', id: relay.matchUpId },
    ]),
  ];
}

/**
 * Under `doubleExitPropagateBye: false`, a matchUp holding this double exit's own carried exit and nothing else of a
 * result: one provenance entry, a carried exit naming the double exit as its source, no winner, scoreless, no codes; the
 * matchUp a BYE (the relay a passage records beside a BYE it passed) or pending that exit (the passage's landing). S7.
 */
function ownCarryAlone(matchUp: HydratedMatchUp, sourceId: string): boolean {
  const [entry, ...more] = Object.values(matchUp.sideExitProvenance ?? {});
  if (!entry || more.length || entry.sourceMatchUpId !== sourceId) return false;
  const status = carriedExitStatus(entry);
  if (!status || matchUp.winningSide || !scoreless(matchUp) || matchUp.matchUpStatusCodes?.length) return false;
  return matchUp.matchUpStatus === BYE || matchUp.matchUpStatus === status;
}

/** A produced exit directly feeding this feed-round BYE, retained beside its empty seat (S7). */
function producedBesideBye(
  view: OutcomeView,
  bye: HydratedMatchUp,
  drawPosition: number,
): MatchUpStatusUnion | undefined {
  if (bye.matchUpStatus !== BYE || bye.winningSide || !scoreless(bye) || bye.matchUpStatusCodes?.length)
    return undefined;
  if (!bye.feedRound || bye.loserMatchUpId || positionsOf(bye).length !== 1) return undefined;
  const side = sideOf(bye, drawPosition);
  const entries = Object.entries(bye.sideExitProvenance ?? {});
  const [kept, ...more] = entries;
  if (!side || !kept || more.length || Number(kept[0]) !== 3 - side) return undefined;
  if (!isDoubleExit(kept[1].previousMatchUpStatus)) return undefined;
  const origin = indexed(view, kept[1].sourceMatchUpId);
  if (!origin || !isDoubleExit(origin.matchUpStatus) || origin.winnerMatchUpId !== bye.matchUpId) return undefined;
  return carriedExitStatus(kept[1]);
}

// Five relay programs follow (`producedRelaySeatOps`, `terminalProducedRelaySeatOps`, `awardedProducedRelaySeatOps`,
// `convergedProducedRelaySeatOps`, `occupiedFinalRelaySeatOps`), one shared wall (`producedBesideBye`) and one shared
// three-op header. They are kept apart on purpose (Mentat assessment/2026-11-07-outcome-refactor-debates.md, ruling
// 2): each is distinguished by the geometry beyond the copy (a next matchUp or none, a final or a round before it, a
// successor that is the final), not by what the copy holds, and each hands its copy to a different writer under a
// different marker (`retainedOnwardMatchUpId`, `retainedCarriedAward`, `withdrawsProducedExit`) that other modules
// key on. A classifier on the copy's content returns `occupied` for FIC_TO_SF 16 of 15 (clear Main 2/3 after
// Consolation 1/2 and Main 2/4 double walkovers): Consolation 3/1 converges holding the carrier alone but feeds
// Consolation 4/1, which v1 also rewrites, and only the occupied program's `next.winnerMatchUpId` clause refuses it.
// Their order in `unwoundSeatOps` is not load-bearing: the predicates are disjoint.
/** The produced copy stands pending and alone, and whatever lies beyond is clean as the unwind leaves it. */
function producedRelaySeatOps(
  view: OutcomeView,
  bye: HydratedMatchUp,
  drawPosition: number,
  withdraw: OutcomeOp,
  withdrawn: Set<string>,
): OutcomeOp[] | undefined {
  const status = producedBesideBye(view, bye, drawPosition);
  const next = indexed(view, bye.winnerMatchUpId);
  if (!status || !next || next.structureId !== bye.structureId || next.loserMatchUpId) return undefined;
  if (next.matchUpStatus !== status || next.winningSide || positionsOf(next).length || !scoreless(next))
    return undefined;
  if (next.matchUpStatusCodes?.length) return undefined;
  const [entry, ...more] = Object.values(next.sideExitProvenance ?? {});
  const [kept] = Object.values(bye.sideExitProvenance ?? {});
  if (!entry || more.length || entry.sourceMatchUpId !== kept.sourceMatchUpId) return undefined;
  if (entry.previousMatchUpStatus !== kept.previousMatchUpStatus || carriedExitStatus(entry) !== status)
    return undefined;
  const beyond = indexed(view, next.winnerMatchUpId);
  if (beyond && (beyond.structureId !== bye.structureId || !unwoundClean(beyond, withdrawn) || beyond.winningSide))
    return undefined;
  return retainedHomeOps(bye, drawPosition, status, withdraw);
}

/** A terminal feed-round relay retains its direct producer's pending exit when its propagated BYE is withdrawn. */
function terminalProducedRelaySeatOps(
  view: OutcomeView,
  bye: HydratedMatchUp,
  drawPosition: number,
  withdraw: OutcomeOp,
): OutcomeOp[] | undefined {
  if (bye.winnerMatchUpId) return undefined;
  const status = producedBesideBye(view, bye, drawPosition);
  const [entry] = Object.values(bye.sideExitProvenance ?? {});
  const origin = indexed(view, entry?.sourceMatchUpId);
  if (!status || !origin || origin.structureId !== bye.structureId) return undefined;
  if (origin.matchUpStatus !== entry.previousMatchUpStatus || origin.matchUpStatusCodes?.length) return undefined;
  return retainedHomeOps(bye, drawPosition, status, withdraw);
}

/** An awarded copy loses its exit on the unwind, before the arriving loser can read it (S7). */
function awardedProducedRelaySeatOps(
  view: OutcomeView,
  bye: HydratedMatchUp,
  drawPosition: number,
  withdraw: OutcomeOp,
  withdrawn: Set<string>,
): OutcomeOp[] | undefined {
  const status = producedBesideBye(view, bye, drawPosition);
  const next = indexed(view, bye.winnerMatchUpId);
  if (!status || !next || next.structureId !== bye.structureId || next.loserMatchUpId) return undefined;
  if (next.matchUpStatus !== status || !next.winningSide || !scoreless(next) || next.matchUpStatusCodes?.length)
    return undefined;
  const winner = next.sides?.find((side) => side.sideNumber === next.winningSide);
  const held = positionsOf(next);
  if (!winner?.participantId || !winner.drawPosition || held.length !== 1) return undefined;
  const [kept] = Object.values(bye.sideExitProvenance ?? {});
  const entries = Object.entries(next.sideExitProvenance ?? {});
  const exits = entries.filter(([, entry]) => isDoubleExit(entry.previousMatchUpStatus));
  const [produced, ...more] = exits;
  if (!produced || more.length || Number(produced[0]) === next.winningSide) return undefined;
  if (produced[1].sourceMatchUpId !== kept.sourceMatchUpId || carriedExitStatus(produced[1]) !== status)
    return undefined;
  if (produced[1].previousMatchUpStatus !== kept.previousMatchUpStatus) return undefined;
  if (
    entries.some(
      ([, entry]) => entry !== produced[1] && (entry.matchUpStatus || entry.previousMatchUpStatus !== COMPLETED),
    )
  )
    return undefined;
  const beyond = indexed(view, next.winnerMatchUpId);
  if (beyond) {
    if (
      beyond.structureId !== next.structureId ||
      beyond.loserMatchUpId ||
      beyond.winningSide ||
      !unwoundClean(beyond, withdrawn)
    )
      return undefined;
    if (!positionsOf(beyond).includes(winner.drawPosition)) return undefined;
    const further = indexed(view, beyond.winnerMatchUpId);
    if (further && (further.structureId !== beyond.structureId || positionsOf(further).includes(winner.drawPosition)))
      return undefined;
  }
  return [
    ...retainedHomeOps(bye, drawPosition, status, withdraw),
    {
      op: 'setMatchUpDrawPositions',
      matchUpId: next.matchUpId,
      drawPositions: held,
      withdrawnByePosition: drawPosition,
      withdrawsProducedExit: true,
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId },
    ...(beyond
      ? [
          {
            op: 'setMatchUpDrawPositions' as const,
            matchUpId: beyond.matchUpId,
            drawPositions: positionsOf(beyond).filter((position) => position !== winner.drawPosition),
            releasedDrawPosition: winner.drawPosition,
            announcesContext: false as const,
          },
          { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: beyond.matchUpId },
        ]
      : []),
  ];
}

/** A produced copy converged with another origin, producing once more into a clean final. */
export function convergedRelayCopy(view: OutcomeView, bye: HydratedMatchUp, drawPosition: number) {
  const status = producedBesideBye(view, bye, drawPosition);
  const next = indexed(view, bye.winnerMatchUpId);
  if (!status || !next || next.structureId !== bye.structureId || next.loserMatchUpId) return undefined;
  if (!isDoubleExit(next.matchUpStatus) || next.winningSide || !scoreless(next)) return undefined;
  if (positionsOf(next).length !== 1 || next.matchUpStatusCodes?.length) return undefined;
  if (next.sides?.some((side) => side.participantId || side.bye)) return undefined;
  const [entry] = Object.values(bye.sideExitProvenance ?? {});
  const origin = indexed(view, entry?.sourceMatchUpId);
  if (!origin) return undefined;
  const entries = Object.values(next.sideExitProvenance ?? {});
  const copy = entries.find((candidate) => candidate.sourceMatchUpId === origin.matchUpId);
  if (entries.length !== 2 || copy?.previousMatchUpStatus !== entry.previousMatchUpStatus) return undefined;
  if (carriedExitStatus(copy) !== status) return undefined;
  const chain = convergedChain(view, origin, { entry: next });
  if (!chain || chain.length !== 2 || !chain[0].rederived || chain[1].rederived) return undefined;
  const kept = chain[0].rederived;
  const successor = indexed(view, chain[1].matchUpId);
  if (!successor || successor.structureId !== next.structureId || successor.loserMatchUpId) return undefined;
  if (successor.winnerMatchUpId || !undecided(successor)) return undefined;
  if (successor.matchUpStatus !== (next.matchUpStatus === DOUBLE_DEFAULT ? DEFAULTED : WALKOVER)) return undefined;
  return { status, next, successor, kept };
}

/** Retain the foreign onward origin before rebuilding the arriving direction. */
function convergedProducedRelaySeatOps(
  view: OutcomeView,
  bye: HydratedMatchUp,
  drawPosition: number,
  withdraw: OutcomeOp,
): OutcomeOp[] | undefined {
  const copy = convergedRelayCopy(view, bye, drawPosition);
  if (!copy) return undefined;
  const { status, next, successor, kept } = copy;
  return [
    ...retainedHomeOps(bye, drawPosition, status, withdraw, { retainedOnwardMatchUpId: next.matchUpId }),
    {
      op: 'setMatchUpResult',
      matchUpId: next.matchUpId,
      matchUpStatus: kept.matchUpStatus,
      resetsScore: true,
      score: blankScore(),
      matchUpStatusCodes: [],
      stampsScoredTime: false,
      announcedAs: 'settleRederivedDoubleExit',
    },
    { op: 'setSideExitProvenance', matchUpId: next.matchUpId, provenance: kept.provenance },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId },
    {
      op: 'setMatchUpResult',
      matchUpId: successor.matchUpId,
      matchUpStatus: TO_BE_PLAYED,
      ...(successor.score ? { resetsScore: true, score: blankScore() } : {}),
      matchUpStatusCodes: [],
      stampsScoredTime: false,
      announcedAs: 'withdrawProducedExits',
    },
    { op: 'setSideExitProvenance', matchUpId: successor.matchUpId },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: successor.matchUpId },
  ];
}

/** The foreign single exit reaches this final only through standing BYEs, carried by its original loser. */
function occupiedFinalCarrier(
  view: OutcomeView,
  final: HydratedMatchUp,
  entry: NonNullable<SideExitProvenance[1]>,
  drawPosition: number,
  participantId: string,
  withdrawn: Set<string>,
): boolean {
  const source = indexed(view, entry.sourceMatchUpId);
  if (!source?.winningSide || source.matchUpStatus !== entry.previousMatchUpStatus) return false;
  if (source.matchUpStatus !== WALKOVER && source.matchUpStatus !== DEFAULTED) return false;
  if (entry.matchUpStatus !== source.matchUpStatus || !scoreless(source) || source.matchUpStatusCodes?.length)
    return false;
  const loser = source.sides?.find((side) => side.sideNumber === 3 - (source.winningSide as number));
  if (loser?.participantId !== participantId) return false;
  const visited = new Set<string>();
  let at = indexed(view, source.loserMatchUpId);
  while (at && at.matchUpId !== final.matchUpId) {
    if (visited.has(at.matchUpId)) return false;
    visited.add(at.matchUpId);
    if (at.structureId !== final.structureId || at.loserMatchUpId || at.matchUpStatus !== BYE || at.winningSide)
      return false;
    if (!scoreless(at) || at.matchUpStatusCodes?.length) return false;
    const side = sideOf(at, drawPosition);
    const carrier = at.sides?.find((candidate) => candidate.sideNumber === side);
    const bye = at.sides?.find((candidate) => candidate.bye);
    if (carrier?.participantId !== participantId || !bye?.drawPosition) return false;
    if (withdrawn.has(seatKey({ structureId: at.structureId, drawPosition: bye.drawPosition }))) return false;
    const [carried, ...more] = Object.entries(at.sideExitProvenance ?? {});
    if (!carried || more.length || Number(carried[0]) !== side) return false;
    if (carried[1].sourceMatchUpId !== source.matchUpId || carried[1].previousMatchUpStatus !== source.matchUpStatus)
      return false;
    if (carried[1].matchUpStatus !== entry.matchUpStatus) return false;
    at = indexed(view, at.winnerMatchUpId);
  }
  return visited.size > 0 && at?.matchUpId === final.matchUpId;
}

/** A clear withdraws a produced copy from an occupied final, retaining the real carrier's own award. */
function occupiedFinalRelaySeatOps(
  view: OutcomeView,
  bye: HydratedMatchUp,
  drawPosition: number,
  withdraw: OutcomeOp,
  withdrawn: Set<string>,
): OutcomeOp[] | undefined {
  const status = producedBesideBye(view, bye, drawPosition);
  const next = indexed(view, bye.winnerMatchUpId);
  if (!status || !next || next.structureId !== bye.structureId || next.winnerMatchUpId || next.loserMatchUpId)
    return undefined;
  if (!isDoubleExit(next.matchUpStatus) || next.winningSide || !scoreless(next) || next.matchUpStatusCodes?.length)
    return undefined;
  const positions = positionsOf(next);
  const carrier = next.sides?.find((side) => side.participantId);
  if (
    positions.length !== 1 ||
    !carrier?.drawPosition ||
    !carrier.participantId ||
    carrier.drawPosition === drawPosition
  )
    return undefined;
  if (next.sides?.some((side) => side.bye || side.qualifier)) return undefined;
  const side = sideOf(next, carrier.drawPosition);
  if (!side) return undefined;
  const [produced] = Object.values(bye.sideExitProvenance ?? {});
  const producer = indexed(view, produced.sourceMatchUpId);
  if (producer?.matchUpStatus !== produced.previousMatchUpStatus) return undefined;
  const entries = Object.entries(next.sideExitProvenance ?? {});
  const copy = entries.find(([, entry]) => entry.sourceMatchUpId === produced.sourceMatchUpId);
  const kept = next.sideExitProvenance?.[side];
  if (entries.length !== 2 || !copy || Number(copy[0]) === side || !kept) return undefined;
  if (copy[1].previousMatchUpStatus !== produced.previousMatchUpStatus || carriedExitStatus(copy[1]) !== status)
    return undefined;
  const carried = carriedExitStatus(kept);
  if (!carried || next.matchUpStatus !== collapseDoubleExitStatus([status, carried])) return undefined;
  if (!occupiedFinalCarrier(view, next, kept, carrier.drawPosition, carrier.participantId, withdrawn)) return undefined;
  const provenance = { [side]: kept };
  return [
    ...retainedHomeOps(bye, drawPosition, status, withdraw, {
      retainedCarriedAward: {
        matchUpId: next.matchUpId,
        carrierDrawPosition: carrier.drawPosition,
        participantId: carrier.participantId,
        matchUpStatus: carried,
        provenance,
      },
    }),
    {
      op: 'setMatchUpResult',
      matchUpId: next.matchUpId,
      matchUpStatus: carried,
      winningSide: (3 - side) as 1 | 2,
      resetsScore: true,
      score: blankScore(),
      matchUpStatusCodes: [],
      stampsScoredTime: false,
      retainedExitPlanned: true,
      announcedAs: 'settleRederivedDoubleExit',
    },
    { op: 'setSideExitProvenance', matchUpId: next.matchUpId, provenance },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId },
  ];
}

/** The empty seat already advanced through its standing opposite BYE; its clear changes neither matchUp. */
function standingByeSeat(view: OutcomeView, seat: WinnerLoserSeat, withdrawn: Set<string>): boolean {
  const opposite = seat.seat?.standingBye?.opponentDrawPosition;
  if (!opposite) return false;
  if (withdrawn.has(seatKey({ structureId: seat.structureId, drawPosition: opposite }))) return false;
  const target = indexed(view, seat.matchUpId);
  if (!target || target.structureId !== seat.structureId || target.roundNumber !== 1 || target.loserMatchUpId)
    return false;
  if (target.matchUpStatus !== BYE || target.winningSide || !scoreless(target)) return false;
  if (target.matchUpStatusCodes?.length || Object.keys(target.sideExitProvenance ?? {}).length) return false;
  const positions = positionsOf(target);
  if (positions.length !== 2 || !positions.includes(seat.drawPosition) || !positions.includes(opposite)) return false;
  if (target.sides?.some((side) => side.participantId || side.qualifier)) return false;
  if (!target.sides?.some((side) => side.drawPosition === opposite && side.bye)) return false;
  const next = indexed(view, target.winnerMatchUpId);
  if (!next || next.structureId !== target.structureId || next.roundNumber !== 2) return false;
  const advanced = positionsOf(next);
  if (advanced.length !== 2 || !advanced.includes(seat.drawPosition) || advanced.includes(opposite)) return false;
  const members = (view.inContextDrawMatchUps ?? []).filter((matchUp) => matchUp.structureId === seat.structureId);
  return members.every((matchUp) => standingByeRemainder(view, matchUp, target, next, seat.drawPosition, opposite));
}

/** Bound the v1 pairing/removal tasks: preserve one BYE advancement, with no result or further reservation. */
function standingByeRemainder(
  view: OutcomeView,
  matchUp: HydratedMatchUp,
  target: HydratedMatchUp,
  next: HydratedMatchUp,
  drawPosition: number,
  opposite: number,
): boolean {
  if (matchUp.matchUpId === target.matchUpId) return true;
  if (matchUp.matchUpStatus !== TO_BE_PLAYED || matchUp.winningSide || !scoreless(matchUp)) return false;
  if (matchUp.matchUpStatusCodes?.length || Object.keys(matchUp.sideExitProvenance ?? {}).length) return false;
  if (matchUp.loserMatchUpId || matchUp.sides?.some((side) => side.bye || side.qualifier)) return false;
  const positions = positionsOf(matchUp);
  if (positions.includes(opposite) || (matchUp.matchUpId !== next.matchUpId && positions.includes(drawPosition)))
    return false;
  if (!matchUp.winnerMatchUpId) return true;
  const onward = indexed(view, matchUp.winnerMatchUpId);
  return (
    !!onward && onward.structureId === target.structureId && (onward.roundNumber ?? 0) > (matchUp.roundNumber ?? 0)
  );
}

export function unwoundSeatOps(
  view: OutcomeView,
  loserSeat: WinnerLoserSeat,
  placedBye: boolean,
  withdrawn: Set<string> = new Set(),
  released: Set<number> = new Set(),
  cascaded = false,
  relay?: UnwindRelay,
  clearing = false,
  clearOnly = false,
): OutcomeOp[] | undefined {
  const { structureId, drawPosition, matchUpId, seat } = loserSeat;
  // a BYE the round-1 loser cascade takes back: v1 announces no assignments for it (`drawPositionRemovals`, S6 tail)
  const withdraw: OutcomeOp = {
    op: 'withdrawBye',
    structureId,
    drawPosition,
    clearedWinnerIds: (view.inContextDrawMatchUps ?? [])
      .filter(
        (matchUp) =>
          matchUp.structureId === structureId &&
          matchUp.drawPositions?.includes(drawPosition) &&
          matchUp.matchUpStatus === TO_BE_PLAYED &&
          !matchUp.winningSide,
      )
      .map(({ matchUpId }) => matchUpId),
    ...(cascaded ? { announcesAssignments: false as const } : {}),
  };
  // a BYE this double exit placed went in behind a FIRST_MATCHUP link too (`advanceByeToLoserMatchUp` asks no condition),
  // and comes out the same way (S6 tail); a seat further on behind one may hold a standing reservation, not this double
  // exit's to take back: v1's
  const conditioned = loserSeat.linkCondition && !(placedBye && loserSeat.linkCondition === FIRST_MATCHUP);
  if (!seat || conditioned) return undefined;
  if (!placedBye)
    return seat.free && (loserSeat.matchUpStatus !== BYE || standingByeSeat(view, loserSeat, withdrawn))
      ? [withdraw]
      : undefined;
  const byeMatchUp = indexed(view, matchUpId);
  if (!seat.bye || !seat.byeFromPropagation || !byeMatchUp) return undefined;
  const produced =
    (clearOnly
      ? indirectProducedRelaySeatOps(view, loserSeat, byeMatchUp, drawPosition, withdraw, withdrawn)
      : undefined) ??
    producedRelaySeatOps(view, byeMatchUp, drawPosition, withdraw, withdrawn) ??
    awardedProducedRelaySeatOps(view, byeMatchUp, drawPosition, withdraw, withdrawn) ??
    convergedProducedRelaySeatOps(view, byeMatchUp, drawPosition, withdraw) ??
    terminalProducedRelaySeatOps(view, byeMatchUp, drawPosition, withdraw) ??
    (clearing ? occupiedFinalRelaySeatOps(view, byeMatchUp, drawPosition, withdraw, withdrawn) : undefined);
  if (produced) return produced;
  // an exit carried onto the BYE matchUp's other side stands once the BYE goes: v1 re-derives the matchUp to it (a
  // final's consolation seat beside a carried walkover, S6 tail): v1's. Under `doubleExitPropagateBye: false` the carry
  // may be this double exit's own, relayed past the BYE on its way from the own seat (S7): the passage withdraws it
  // after this seat (`unwoundPassage`, which reads the matchUp as this withdrawal leaves it: `UnwindRelay`)
  const relayed = !!relay && ownCarryAlone(byeMatchUp, relay.sourceId);
  // ...or a participant's carried exit beside the BYE in the structure's last round, which stands once the BYE goes: v1
  // re-derives the matchUp to it (S7, `carriedBesideBye`); a carrier the BYE sent on (a next matchUp) is v1's
  const rederived = relayed ? undefined : carriedBesideBye(byeMatchUp, drawPosition);
  // ...or a carrier the BYE sent on into the next matchUp, whom v1 releases back out of it, the carry with them, and the
  // loser then arrives beside the carry and is awarded it (S7, `carrierSentOn`, `unwoundAwardOps`)
  const sentOn = relayed || rederived ? undefined : carrierSentOn(view, byeMatchUp, drawPosition, withdrawn);
  if (!relayed && !rederived && !sentOn && Object.keys(byeMatchUp.sideExitProvenance ?? {}).length) return undefined;
  // the BYE beside another (two paired double exits' loser seats, S6 tail): the standing BYE then advances the freed seat
  if (seat.opponentBye) return doubleByeSeatOps(view, loserSeat, byeMatchUp, withdraw);
  if (byeMatchUp.matchUpStatus !== BYE) return undefined;
  // the BYE matchUp links its own loser on: to be played again, it takes back the BYE it had sent to that seat
  // (`handleLoserMatchUpRemoval`): planned at a first-round seat holding a propagated BYE behind no condition (S6 tail)
  const cascade = byeMatchUp.loserMatchUpId ? cascadedSeatOps(view, loserSeat.beyond, withdrawn, released) : [];
  if (!cascade) return undefined;
  const opposite = loserSeat.drawPositions.filter((position) => position !== drawPosition);
  const ops: OutcomeOp[] = [
    withdraw,
    {
      op: 'clearMatchUpBye',
      matchUpId,
      drawPosition,
      ...((rederived ?? sentOn) ? { rederived: rederived ?? sentOn?.rederived } : {}),
    },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
  ];
  // a structure's last round (COMPASS's one-round structures): the BYE sent nothing on (S6 tail)
  if (!byeMatchUp.winnerMatchUpId) return [...ops, ...cascade];
  const next = indexed(view, byeMatchUp.winnerMatchUpId);
  const held = (next?.drawPositions ?? []).filter((position): position is number => !!position);
  // a BYE alone in its matchUp sent nobody on; a next matchUp holding a position is rewritten by v1's position clear
  // all the same, and announced (census 20660398, FEED_IN_CHAMPIONSHIP_TO_SF 16): v1's, unless the own seat's
  // withdrawal releases that position out of it and writes it last, the rewrite's notice superseded (S6 tail)
  if (!opposite.length) return held.some((position) => !released.has(position)) ? undefined : [...ops, ...cascade];
  if (opposite.length > 1 || !next || !held.includes(opposite[0])) return undefined;
  if (sentOn) return [...ops, ...carrierHomeOps(sentOn, drawPosition), ...cascade];
  const beyond = withdrawnByeNextOps(next, held, opposite[0], drawPosition, withdrawn, relayed ? relay : undefined);
  return beyond && [...ops, ...beyond, ...cascade];
}

/**
 * The next matchUp of a withdrawn BYE's matchUp, which the BYE had sent the opposite position on into (`unwoundSeatOps`):
 * the position taken back out of it. Where it is the passage's landing, the own carry pending there (S7), v1's removal
 * takes the position and the pending exit with it, named for the withdrawn BYE whether or not a position stays
 * (`updateMatchUpStatusAfterRemoval`; the release path leaves a pending exit alone), and the passage then finds nothing
 * of this unwind's there. Otherwise planned where it is to be played with no result or provenance: where another
 * position stands, as v1's position clear writes it, named for the withdrawn BYE; alone there, the matchUp is left with
 * no position, which v1 releases instead (`releaseAdvancedDrawPosition`, with neither event nor tournament):
 * FIRST_MATCH_LOSER_CONSOLATION's own seat beside an unfilled fed seat, the double BYE its unfillable seat makes behind
 * FIRST_MATCHUP (S6 tail). Undefined for anything else.
 */
function withdrawnByeNextOps(
  next: HydratedMatchUp,
  held: number[],
  advanced: number,
  drawPosition: number,
  withdrawn: Set<string>,
  relay?: UnwindRelay,
): OutcomeOp[] | undefined {
  const remaining = held.filter((position) => position !== advanced);
  const stamp: OutcomeOp = { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId };
  if (relay && next.matchUpStatus !== BYE && ownCarryAlone(next, relay.sourceId)) {
    if (next.sides?.some((side) => side.bye)) return undefined;
    const reset: OutcomeOp = {
      op: 'setMatchUpDrawPositions',
      matchUpId: next.matchUpId,
      drawPositions: remaining,
      withdrawnByePosition: drawPosition,
      clearsPendingExit: true,
    };
    return [reset, stamp];
  }
  // a BYE beside the position there that this unwind withdraws is read as withdrawn: the matchUp is then to be played
  const byeStands = (side: HydratedSide) =>
    !!side.bye && !withdrawn.has(seatKey({ structureId: next.structureId, drawPosition: side.drawPosition }));
  const standing = next.sides?.some(byeStands);
  const toBePlayed = next.matchUpStatus === TO_BE_PLAYED || (next.matchUpStatus === BYE && !standing);
  if (!toBePlayed || next.winningSide || !scoreless(next)) return undefined;
  if (Object.keys(next.sideExitProvenance ?? {}).length || standing) return undefined;
  const taken: OutcomeOp = remaining.length
    ? {
        op: 'setMatchUpDrawPositions',
        matchUpId: next.matchUpId,
        drawPositions: remaining,
        withdrawnByePosition: drawPosition,
      }
    : {
        op: 'setMatchUpDrawPositions',
        matchUpId: next.matchUpId,
        drawPositions: remaining,
        releasedDrawPosition: advanced,
        announcesContext: false,
      };
  return [taken, stamp];
}

/** the seat a BYE matchUp's loser link feeds, its BYE taken back as v1's round-1 loser cascade takes it (S6 tail) */
function cascadedSeatOps(
  view: OutcomeView,
  beyond: WinnerLoserSeat | undefined,
  withdrawn: Set<string>,
  released: Set<number>,
): OutcomeOp[] | undefined {
  if (!beyond?.seat?.bye || !beyond.seat.byeFromPropagation || beyond.linkCondition) return undefined;
  if (indexed(view, beyond.matchUpId)?.roundNumber !== 1) return undefined;
  const ops = unwoundSeatOps(view, beyond, true, withdrawn, released, true);
  // the cascade announces the matchUps it writes there, which stamps their structure (`structureStamps` reads no quiet seat)
  return ops && beyond.structureId
    ? [...ops, { op: 'stampUpdatedAt', entity: 'structure', id: beyond.structureId }]
    : ops;
}

/**
 * v1's `removeDirectedBye` at a seat whose BYE stands beside another BYE (the loser seats of two paired double exits, a
 * double BYE: S6 tail, family 4): the BYE withdrawn; the position the double BYE had sent on (the other BYE's) taken back
 * out of the next matchUp, which is to be played again, and what that matchUp, a BYE until then, had sent on in turn
 * released out of the matchUp beyond (`releaseAdvancedDrawPosition`); then, after the call's own write, the standing
 * BYE advances the freed seat into the next matchUp (`reconcileByeAdvancements`, announced `advanceWinner`; deferred by
 * `unwoundOps`). Planned where the next matchUp holds the other BYE's position and one more, nothing else, and the
 * matchUp beyond is to be played holding that one, alone or beside a position standing there (a feed round's fed seat:
 * the one taken out as v1's position clear takes it, named for the withdrawn BYE, S7). A next matchUp kept a BYE by
 * another standing BYE
 * (FIRST_MATCH_LOSER_CONSOLATION, the advance going on through it) is v1's.
 */
function doubleByeSeatOps(
  view: OutcomeView,
  loserSeat: WinnerLoserSeat,
  byeMatchUp: HydratedMatchUp,
  withdraw: OutcomeOp,
): OutcomeOp[] | undefined {
  const { drawPosition } = loserSeat;
  // the BYE matchUp keeps a BYE (the other one), so v1 cascades nothing from it, whatever it links its loser to (S6 tail)
  if (byeMatchUp.matchUpStatus !== BYE) return undefined;
  // the one other position of the BYE matchUp (a filtered list, not a side read by index)
  const [other, ...more] = loserSeat.drawPositions.filter((position) => position !== drawPosition);
  const next = indexed(view, byeMatchUp.winnerMatchUpId);
  const held = positionsOf(next);
  // the double BYE sent one of its two positions on: the other BYE's, which the freed seat then replaces (two paired
  // double exits' seats, family 4), or this seat's own, which stays as the freed seat it now is (a BYE matchUp's BYE
  // loser beside it, family 5)
  const advanced = held.find((position) => position === drawPosition || position === other);
  if (!other || more.length || !next || !advanced || held.length !== 2) return undefined;
  if (next.matchUpStatus !== BYE || next.winningSide || !scoreless(next) || next.loserMatchUpId) return undefined;
  if (Object.keys(next.sideExitProvenance ?? {}).length || next.matchUpStatusCodes?.length) return undefined;
  const remaining = held.filter((position) => position !== advanced);
  const ownAdvanced = advanced === drawPosition;
  // the next matchUp, a BYE until now, sent its one other position on: that position comes back out of the matchUp beyond,
  // to be played. Where another standing BYE keeps the next matchUp a BYE (FIRST_MATCH_LOSER_CONSOLATION: the freed seat
  // then goes on through it), what it sent on was a BYE and the matchUp beyond is a BYE too: v1's
  const beyond = indexed(view, next.winnerMatchUpId);
  if (!beyond || beyond.matchUpStatus !== TO_BE_PLAYED || beyond.winningSide || !scoreless(beyond)) return undefined;
  if (Object.keys(beyond.sideExitProvenance ?? {}).length || beyond.matchUpStatusCodes?.length) return undefined;
  // the position the next matchUp, a BYE, sent on stands in the matchUp beyond; a feed round's fed seat beside it stays
  // (a plain round's other position came through a BYE this unwind takes back as well: released with it)
  const stood = beyond.feedRound ? positionsOf(beyond).filter((position) => position !== remaining[0]) : [];
  const taken: OutcomeOp[] = ownAdvanced
    ? []
    : [
        {
          op: 'setMatchUpDrawPositions',
          matchUpId: next.matchUpId,
          drawPositions: remaining,
          withdrawnByePosition: drawPosition,
        },
      ];
  const freed: OutcomeOp[] = ownAdvanced
    ? []
    : [
        // deferred past the call's own write (`unwoundOps`): the standing BYE advances the freed seat
        {
          op: 'setMatchUpDrawPositions',
          matchUpId: next.matchUpId,
          drawPositions: [...remaining, drawPosition].sort((a, b) => a - b),
          advancesThroughBye: true,
          announcesEvent: true,
        },
      ];
  return [
    withdraw,
    { op: 'clearMatchUpBye', matchUpId: next.matchUpId, drawPosition },
    ...taken,
    { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId },
    // alone there it is released; beside a position standing there (a feed round's fed seat) it is taken out as v1's
    // position clear takes it, named for the withdrawn BYE (S7)
    stood.length
      ? {
          op: 'setMatchUpDrawPositions',
          matchUpId: beyond.matchUpId,
          drawPositions: stood,
          withdrawnByePosition: drawPosition,
        }
      : {
          op: 'setMatchUpDrawPositions',
          matchUpId: beyond.matchUpId,
          drawPositions: [],
          releasedDrawPosition: remaining[0],
          announcesContext: false,
        },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: beyond.matchUpId },
    ...freed,
  ];
}
