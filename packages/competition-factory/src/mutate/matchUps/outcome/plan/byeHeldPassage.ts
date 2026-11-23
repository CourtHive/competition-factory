import { buildSideExitProvenance, collapseDoubleExitStatus } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { SINGLE_EXITS, indexed, onwardFrom } from './planShared';
import { isDoubleExit } from '@Validators/isExit';
import { producedTarget } from './producedTarget';

// constants and types
import {
  BYE,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  TO_BE_PLAYED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import type { DirectionPlan, OutcomeView } from '../types';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { OutcomeOp } from '../ops';

/**
 * The produced exit's passage past a BYE-held matchUp (S7), shared by its two origins: a call's own double exit
 * (`producedExit`) and a converged matchUp producing on (1c, `convergence`).
 */

/**
 * The double exit whose produced exit passes a BYE-held matchUp: the call's own, or a converged matchUp producing on
 * (1c: `advanceConvergedWinner` onto a BYE-held target, DEA:801-830 then :1185). Its paired feeder is the matchUp beside
 * it, whose origin a plain round records beside the BYE's; a loser link from it is not planned.
 */
export type PassageOrigin = {
  matchUpId: string;
  matchUpStatus: MatchUpStatusUnion;
  paired?: HydratedMatchUp;
  loserLinked: boolean;
};

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
export function byeHeldProduced(
  view: OutcomeView,
  produced: NonNullable<DirectionPlan['produced']>,
  source: PassageOrigin,
): ByeHeldPassage | undefined {
  if (source.loserLinked) return undefined;
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
      ...(isDoubleExit(level.matchUpStatus) ? { removesWinningSide: true as const } : {}),
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

/**
 * the produced exit past a BYE-held next matchUp, as v1 writes it (`byeHeldProduced`), from either origin; undefined where
 * the passage is not planned
 */
export function byeHeldProducedOps(
  view: OutcomeView,
  produced: NonNullable<DirectionPlan['produced']>,
  source: PassageOrigin,
): OutcomeOp[] | undefined {
  const passage = byeHeldProduced(view, produced, source);
  if (!passage) return undefined;
  const { beyond, arrivalSide, relays, onward, converged } = passage;
  // in a plain round the BYE came from the matchUp beside this one (a double BYE): its origin is recorded too
  const paired = indexed(view, produced.matchUpId)?.feedRound ? undefined : source.paired;
  const recorded = (matchUpId: string, sourceSideNumber: 1 | 2, withPaired?: boolean): OutcomeOp[] => {
    const provenance = buildSideExitProvenance({
      sourceMatchUpStatus: source.matchUpStatus,
      sourceMatchUpId: source.matchUpId,
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
      ...(relays.length ? { initializesScore: true as const } : {}),
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
      removesWinningSide: true,
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
