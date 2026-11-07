import { buildCarriedExitProvenance } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { SETTLE_PASS_LIMITS } from '@Mutate/matchUps/matchUpStatus/settleBounds';
import { convergenceAt, convergenceOps } from './convergence';
import {
  carriedStatus,
  indexed,
  onwardFrom,
  reentersWinner,
  relabelsWhereWinnerStands,
  scoreless,
  sideOf,
} from './planShared';

// constants and types
import { BYE, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { Convergence } from './convergence';
import type { OutcomeOp } from '../ops';
import type {
  AbstainReason,
  ByePassage,
  CarryLevel,
  DirectionPlan,
  MatchUpWrite,
  OutcomeRequest,
  OutcomeView,
  PlanArgs,
  ThroughBye,
  WithdrawnCarry,
} from '../types';

/**
 * An exit carried across the loser link (S5, `propagateExitStatus` RULES 1 to 3) and its corrections (S6): where it
 * lands, past which BYEs, how deep, and the writes on the landing; the relabel and withdrawal of a carry for the same
 * winner.
 */

/**
 * S5: an exit carried across the loser link (`propagateExitStatus`), planned where it lands on a clean seat with nobody
 * opposite, or a participant who goes on into a clean next matchUp (RULE 3). v1's `progressExitStatus` then takes RULE 2: the loser's matchUp is written the carried status (a retirement
 * as a WALKOVER), awarded to the empty side, its codes derived from provenance (`[]`, no reason recorded), and the
 * carrier's side given the carried entry. Its winner is nobody, so nothing advances (`directParticipants`'
 * `winnerSlotEmpty`). Abstained: a BYE opposite (RULE 1), a participant opposite with nowhere clean to go on to, a matchUp holding a result, an exit, codes
 * or provenance (RULE 4 and the convergences), client codes on the call (the reason would ride with the side), and a
 * matchUp that links its own loser on: the carrier would carry the exit again (`propagateExitFrom`'s loop, which F9
 * bounds; v2 plans no loop, so it plans one level and abstains where there would be another).
 */
export function carriedReason(view: OutcomeView, write: MatchUpWrite): AbstainReason | undefined {
  const { targets } = view;
  const seat = targets.loserTargetSeat;
  if (write.matchUpStatusCodes?.length) return 'exit';
  if (!seat?.free) return 'exit';
  const record = targets.loserMatchUpRecord;
  if (!record || record.provenance || record.matchUpStatusCodes?.length) return 'exit';
  // RULE 1: a BYE opposite, which the carrier passes into a clean next matchUp (`loserThroughBye`), where the exit lands,
  // or on through the BYE-held matchUps beyond it, to a clean one or the structure's last round (`loserByePassage`)
  if (seat.opponentBye) {
    if (targets.loserMatchUpStatus !== BYE || (!targets.loserThroughBye && !targets.loserByePassage)) return 'exit';
  } else if (
    targets.loserMatchUpStatus !== TO_BE_PLAYED ||
    targets.loserMatchUpHasResult ||
    targets.loserMatchUpCarriesExit
  )
    return 'exit';
  const landing = carriedLanding(view);
  // a landing that links its loser on carries the exit again: planned level by level (`deeperLandings`)
  if (!landing || (landing.carriesOn && !deeperLandings(view, landing, carriedStatus(write.matchUpStatus))))
    return 'exit';
  // RULE 3: somebody stands opposite, wins the carried exit and goes on, planned into a clean next matchUp
  if (landing.opponentHeld && !landing.onward) return 'exit';
  return undefined;
}

/**
 * S6: the same winner relabelled an exit its loser carries across their link (`propagateExitStatus`: a played result
 * re-entered as a WALKOVER or DEFAULTED). v1 directs nothing again (the loser already stands on the seat the link fed,
 * the winner in the next matchUp) and carries the exit to the loser where they stand, as a fresh entry does: the
 * loser's matchUp written the carried status, awarded to the side opposite, with the carry's provenance (`carriedOps`).
 * Planned on the same terms as a fresh carry, the seat held by the loser instead of free: their matchUp to be played,
 * with no result, exit, codes or provenance, nobody gone on past a BYE beside them, and a clean landing.
 */
export function relabelCarryReason(view: OutcomeView, write: MatchUpWrite): AbstainReason | undefined {
  const { targets } = view;
  if (write.matchUpStatusCodes?.length) return 'exit';
  const record = targets.loserMatchUpRecord;
  if (!record || record.matchUpStatusCodes?.length) return 'exit';
  // the carry this matchUp made there, standing alone: rewritten in place, or left as it is (S6 tail)
  const held = targets.loserMatchUpCarryHeld;
  if (!held && (record.provenance || targets.loserMatchUpStatus !== TO_BE_PLAYED)) return 'exit';
  const landing = carriedLanding(view);
  if (!landing || (landing.carriesOn && !deeperLandings(view, landing, carriedStatus(write.matchUpStatus))))
    return 'exit';
  if (landing.opponentHeld && !landing.onward) return 'exit';
  return undefined;
}

/**
 * S6 (F2): an exit its loser carried, relabelled a played result for the same winner. v1 takes the carry back off the
 * loser's matchUp: to be played again, no winner, its carry provenance gone and its score as it was, and its
 * `scoredTime` taken by the `reconcileScoredTimes` pass, under whose name the matchUp is announced. Planned where the
 * carry is all that matchUp holds: this matchUp's provenance alone, nobody awarded it and gone on, and no loser link out
 * of it (the carrier carried nothing further). A withdrawal the carry converged in (`loserWins`) is v1's.
 */
export function withdrawnReason(view: OutcomeView, withdrawn: WithdrawnCarry): AbstainReason | undefined {
  const { targets } = view;
  const entry = indexed(view, targets.loserMatchUpId);
  if (withdrawn.loserWins || withdrawn.matchUpStatus !== TO_BE_PLAYED || !entry) return 'exit';
  if (!targets.loserMatchUpCarriesSourceExit || entry.loserMatchUpId) return 'exit';
  const provenance = Object.values(entry.sideExitProvenance ?? {}).filter(Boolean);
  if (provenance.length !== 1 || entry.matchUpStatusCodes?.some((code) => typeof code !== 'string')) return 'exit';
  const awarded = entry.sides?.find((side) => side.sideNumber === entry.winningSide);
  if (awarded?.bye) return 'exit';
  // the awardee went on: their position comes back out of the next matchUp, planned where they stand there alone or
  // beside one other, nothing played (`releasedAward`); gone further, or somewhere else, v1's
  if (awarded?.participantId && !releasedAward(view, entry, awarded.drawPosition)) return 'exit';
  return undefined;
}

/**
 * The matchUp a participant awarded a carried exit went on into, as the withdrawal leaves it (v1's
 * `releaseAdvancedDrawPosition`): their position taken back out of a clean next matchUp of the same structure that holds
 * it (to be played, no winner, score, provenance or BYE). Undefined where they went nowhere (nothing to release), false
 * where the next matchUp is not that.
 */
function releasedAward(
  view: OutcomeView,
  entry: HydratedMatchUp,
  drawPosition?: number,
): { matchUpId: string; drawPositions: number[] } | false | undefined {
  const next = indexed(view, entry.winnerMatchUpId);
  const held = (next?.drawPositions ?? []).filter((position): position is number => !!position);
  if (!next || !drawPosition) return undefined;
  if (!held.includes(drawPosition)) return undefined;
  const clean =
    next.structureId === entry.structureId &&
    next.matchUpStatus === TO_BE_PLAYED &&
    !next.winningSide &&
    scoreless(next) &&
    !next.matchUpStatusCodes?.length &&
    !Object.keys(next.sideExitProvenance ?? {}).length &&
    !next.sides?.some((side) => side.bye);
  return clean
    ? { matchUpId: next.matchUpId, drawPositions: held.filter((position) => position !== drawPosition) }
    : false;
}

function withdrawnOps(view: OutcomeView): OutcomeOp[] {
  const { loserMatchUpId, loserStructureId, source } = view.targets;
  const entry = indexed(view, loserMatchUpId);
  if (!loserMatchUpId || !entry) return [];
  // the awardee's position released first: v1 announces the matchUp they came out of before the loser's (its own write
  // is the settle pass's, the call's last)
  const awarded = entry.sides?.find((side) => side.sideNumber === entry.winningSide);
  const release = awarded?.participantId ? releasedAward(view, entry, awarded.drawPosition) : undefined;
  return [
    ...(release
      ? [
          {
            op: 'setMatchUpDrawPositions' as const,
            matchUpId: release.matchUpId,
            drawPositions: release.drawPositions,
            releasedDrawPosition: awarded?.drawPosition,
          },
          { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: release.matchUpId },
        ]
      : []),
    {
      op: 'setMatchUpResult',
      matchUpId: loserMatchUpId,
      matchUpStatus: TO_BE_PLAYED,
      announcedAs: 'reconcileScoredTimes',
    },
    { op: 'setSideExitProvenance', matchUpId: loserMatchUpId },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: loserMatchUpId },
    ...(loserStructureId && loserStructureId !== source.structureId
      ? [{ op: 'stampUpdatedAt' as const, entity: 'structure' as const, id: loserStructureId }]
      : []),
  ];
}

type CarriedLanding = {
  /** the matchUp the carried exit is written on: the loser's, or past a BYE the one the carrier goes on into */
  matchUpId: string;
  sideNumber: 1 | 2;
  /** the matchUp links its loser on: the carrier would carry the exit again */
  carriesOn: boolean;
  /** somebody stands opposite the carrier there */
  opponentHeld: boolean;
  /** RULE 3: the opponent standing there, their position joining the next matchUp, which holds these after */
  onward?: { matchUpId: string; drawPositions: number[] };
  /** RULE 1: the BYE matchUps the carrier passed, in order, each recording the carry beside its BYE on the carrier's side */
  relays?: { matchUpId: string; sideNumber: 1 | 2 }[];
  /** past the BYEs, the matchUp the carrier's position joins, with the positions it holds after */
  beyond?: ThroughBye;
  /** RULE 1 in the structure's last round: the carry is recorded beside the BYEs and stops; nothing is written beyond */
  ends?: boolean;
  /** how many of v1's `propagateExitFrom` iterations this landing takes: one per BYE passed, one for the write */
  passes: number;
  /** RULE 4 at a deeper level: the exit meets one standing there, and the double exit is written instead (S6 tail) */
  converged?: Convergence;
};

/**
 * Where the carried exit lands, as the index holds it: the loser's matchUp, or, past a BYE (RULE 1), the matchUp the
 * carrier goes on into (`findAdvancementMatchUp`: the one holding their position), which must hold no codes or
 * provenance of its own. Then the side the carrier is on, whether that matchUp links its loser on, and, where a
 * participant stands opposite (RULE 3), the next matchUp they go on into. v1's nested write directs that winner
 * (`directParticipants` → `directWinner`), so it is planned only into a matchUp of the same structure that is
 * `TO_BE_PLAYED` with no result, BYE or provenance, and a seat to take: there the arrival records no provenance (it is
 * outside the exit cascade) and nothing more follows.
 */
function carriedLanding(view: OutcomeView): CarriedLanding | undefined {
  const { loserMatchUpId, loserTargetDrawPosition, loserTargetSeat, loserThroughBye, loserByePassage } = view.targets;
  if (!loserTargetSeat?.opponentBye) return landingAt(view, loserMatchUpId, loserTargetDrawPosition);
  return passedLanding(view, loserMatchUpId, loserTargetDrawPosition, loserThroughBye, loserByePassage);
}

/**
 * RULE 1: the carrier on `drawPosition` opposite a BYE in `byeMatchUpId` passes it, and any BYE-held matchUps past it
 * (`ByePassage`), each recording the carry beside its BYE, into the clean matchUp beyond, where the exit lands; or, the
 * passage ending in the structure's last round, the carry stops there (S6 tail)
 */
function passedLanding(
  view: OutcomeView,
  byeMatchUpId: string | undefined,
  drawPosition: number | undefined,
  through?: ThroughBye,
  passage?: ByePassage,
): CarriedLanding | undefined {
  const relays: { matchUpId: string; sideNumber: 1 | 2 }[] = [];
  // the carrier's position stands in each BYE matchUp passed (`byePassage` read it there)
  for (const matchUpId of [byeMatchUpId, ...(passage?.byes ?? [])]) {
    const sideNumber = sideOf(indexed(view, matchUpId), drawPosition);
    if (matchUpId && sideNumber) relays.push({ matchUpId, sideNumber });
  }
  const beyond = through ?? passage?.through;
  const last = relays[relays.length - 1];
  if (!beyond)
    return passage
      ? { ...last, carriesOn: false, opponentHeld: false, relays, ends: true, passes: relays.length }
      : undefined;
  const landing = landingAt(view, beyond.matchUpId, drawPosition, { beyondBye: true });
  return landing ? { ...landing, relays, beyond, passes: relays.length + 1 } : undefined;
}

/** a carried exit's landing at a matchUp, the carrier on `drawPosition`: their side, who is opposite, and what follows */
function landingAt(
  view: OutcomeView,
  matchUpId: string | undefined,
  drawPosition: number | undefined,
  { beyondBye }: { beyondBye?: boolean } = {},
): CarriedLanding | undefined {
  const entry = indexed(view, matchUpId);
  const sideNumber = sideOf(entry, drawPosition);
  if (!entry || !sideNumber) return undefined;
  if (beyondBye && (entry.matchUpStatusCodes?.length || Object.keys(entry.sideExitProvenance ?? {}).length))
    return undefined;
  const opponent = entry.sides?.find((side) => side.sideNumber === 3 - sideNumber);
  const landing: CarriedLanding = {
    opponentHeld: !!opponent?.participantId || !!opponent?.bye,
    carriesOn: !!entry.loserMatchUpId,
    matchUpId: entry.matchUpId,
    passes: 1,
    sideNumber,
  };
  if (!opponent?.participantId || opponent.bye || !opponent.drawPosition) return landing;
  const standing = view.targets.loserMatchUpCarryHeld && entry.matchUpId === view.targets.loserMatchUpId;
  const onward = onwardFrom(view, entry, opponent.drawPosition, { standing });
  return onward ? { ...landing, onward } : landing;
}

/**
 * The levels a carried exit goes on to past its first landing (`propagateExitFrom`'s loop): the carrier loses each
 * landing and crosses its loser link, and the exit lands again by RULE 2 or 3, or past a BYE opposite by RULE 1 in the
 * clean matchUp beyond it. Planned where every level is clean, as the first must be: a free seat behind no link
 * condition, in a matchUp to be played holding no result, exit, codes or provenance (or a BYE the carrier passes), until a
 * landing links nothing on. Undefined otherwise, and where the walk reached
 * v1's bound with a level to go (F9: v1 refuses there; v2 abstains, so it never plans the bound).
 */
function deeperLandings(
  view: OutcomeView,
  first: CarriedLanding,
  carried: MatchUpStatusUnion,
): DeeperLanding[] | undefined {
  // v1's loop takes one iteration per BYE passed and one per landing written, and refuses with a level still to go at its
  // bound (F9): v2 abstains there, so it never plans the bound
  let passes = first.passes;
  if (!first.carriesOn) return passes > SETTLE_PASS_LIMITS.exitLevels ? undefined : [];
  const chain = view.targets.carryLevels;
  if (!chain || chain.bounded || chain.levels[0]?.fromMatchUpId !== first.matchUpId) return undefined;
  const deeper: DeeperLanding[] = [];
  for (const level of chain.levels) {
    const landing = levelLanding(view, level, carried);
    if (!landing || (landing.opponentHeld && !landing.onward)) return undefined;
    passes += landing.passes;
    deeper.push({ level, landing });
    if (!landing.carriesOn) return passes > SETTLE_PASS_LIMITS.exitLevels ? undefined : deeper;
  }
  return undefined;
}

type DeeperLanding = { level: CarryLevel; landing: CarriedLanding };

/** where the exit lands at one further level of the walk, as the first level's landing is read; undefined where v1's */
function levelLanding(view: OutcomeView, level: CarryLevel, carried: MatchUpStatusUnion): CarriedLanding | undefined {
  if (level.linkCondition || !level.seat?.free) return undefined;
  const { matchUpId, drawPosition, record } = level;
  // RULE 1 at this level: a BYE opposite, which the carrier passes into a clean matchUp beyond, where the exit lands, or
  // on through the BYE-held matchUps past it (`passage`)
  if (level.seat.opponentBye) {
    if (level.matchUpStatus !== BYE || (!level.through && !level.passage)) return undefined;
    if (!record || record.provenance || record.matchUpStatusCodes?.length) return undefined;
    return passedLanding(view, matchUpId, drawPosition, level.through, level.passage);
  }
  // RULE 4 at this level: a carried exit standing there was awarded to the carrier's seat; the two converge (S6 tail)
  const converged = convergenceAt(view, matchUpId, drawPosition, carried, level.walk);
  if (converged) {
    if (!record || record.matchUpStatusCodes?.length) return undefined;
    return { ...converged, carriesOn: false, opponentHeld: false, passes: 1, converged };
  }
  if (level.matchUpStatus !== TO_BE_PLAYED || level.hasResult || level.carriesExit) return undefined;
  if (!record || record.provenance || record.matchUpStatusCodes?.length) return undefined;
  return landingAt(view, matchUpId, drawPosition);
}

/**
 * The carried exit's write on the loser's matchUp, as v1's `progressExitStatus` makes it (RULES 2 and 3): the status,
 * the award to the side opposite the carrier (nobody yet, or the participant standing there, who then goes on), the codes it derives (`[]`), the score a WALKOVER blanks, then the carrier's
 * entry merged into its provenance (`buildCarriedExitProvenance`, v1's own builder). Announced as the score write it is.
 */
function carriedOps(
  view: OutcomeView,
  request: OutcomeRequest,
  write: MatchUpWrite,
  loser?: DirectionPlan['loser'],
): { relay: OutcomeOp[]; landing: OutcomeOp[] } {
  const landing = carriedLanding(view);
  const deeper = landing && loser?.exit ? deeperLandings(view, landing, loser.exit) : undefined;
  if (!loser?.exit || !landing || !deeper) return { relay: [], landing: [] };
  const exit = loser.exit;
  // the entry a side carrying the exit is given: its origin the matchUp the carrier lost, and what that matchUp was
  const carried = (exitingSideNumber: 1 | 2, sourceMatchUpId?: string, previousMatchUpStatus?: MatchUpStatusUnion) =>
    buildCarriedExitProvenance({ previousMatchUpStatus, sourceMatchUpId, matchUpStatus: exit, exitingSideNumber });
  const provenanceOps = (
    matchUpId: string,
    provenance?: ReturnType<typeof carried>,
    announcedAs?: 'progressExitStatus',
  ): OutcomeOp[] =>
    provenance
      ? [{ op: 'mergeSideExitProvenance', matchUpId, provenance, ...(announcedAs ? { announcedAs } : {}) }]
      : [];
  const source = { matchUpId: request.matchUpId, status: write.matchUpStatus as MatchUpStatusUnion };
  // RULE 1: each BYE matchUp passed stays a BYE and records the carry beside its BYE, announced by itself
  const relayed = (at: CarriedLanding, sourceMatchUpId?: string, previousMatchUpStatus?: MatchUpStatusUnion) =>
    (at.relays ?? []).flatMap(({ matchUpId, sideNumber }): OutcomeOp[] => [
      ...provenanceOps(matchUpId, carried(sideNumber, sourceMatchUpId, previousMatchUpStatus), 'progressExitStatus'),
      { op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId },
    ]);
  const relay = relayed(landing, source.matchUpId, source.status);
  const landed = (
    at: CarriedLanding,
    sourceMatchUpId?: string,
    previousMatchUpStatus?: MatchUpStatusUnion,
  ): OutcomeOp[] => {
    if (at.converged) return convergenceOps(view, at.converged, exit, sourceMatchUpId, previousMatchUpStatus);
    if (at.ends) return [];
    return [
      {
        op: 'setMatchUpResult',
        matchUpId: at.matchUpId,
        matchUpStatus: exit,
        winningSide: (3 - at.sideNumber) as 1 | 2,
        matchUpStatusCodes: [],
        ...(exit === WALKOVER ? { score: { scoreStringSide1: '', scoreStringSide2: '' } } : {}),
      },
      ...provenanceOps(at.matchUpId, carried(at.sideNumber, sourceMatchUpId, previousMatchUpStatus)),
      { op: 'stampUpdatedAt', entity: 'matchUp', id: at.matchUpId },
      // RULE 3: the opponent awarded the exit goes on, their position joining the next matchUp
      ...(at.onward
        ? [
            {
              op: 'setMatchUpDrawPositions' as const,
              matchUpId: at.onward.matchUpId,
              drawPositions: at.onward.drawPositions,
            },
            { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: at.onward.matchUpId },
          ]
        : []),
    ];
  };
  // each further level: the carrier placed across the landing's loser link, the exit carried from the landing they lost;
  // past a BYE there the BYE matchUp records the carry beside its BYE and the carrier goes on, as at the first level
  const levels = deeper.flatMap(({ level, landing: at }): OutcomeOp[] => [
    {
      op: 'assignPosition',
      structureId: level.structureId,
      drawPosition: level.drawPosition,
      participantId: loser.participantId,
    },
    ...relayed(at, level.fromMatchUpId, exit),
    ...(at.beyond
      ? [
          {
            op: 'setMatchUpDrawPositions' as const,
            matchUpId: at.beyond.matchUpId,
            drawPositions: at.beyond.drawPositions,
          },
          { op: 'stampUpdatedAt' as const, entity: 'matchUp' as const, id: at.beyond.matchUpId },
        ]
      : []),
    ...landed(at, level.fromMatchUpId, exit),
  ]);
  return { relay, landing: [...landed(landing, source.matchUpId, source.status), ...levels] };
}

/**
 * The carried exit's ops (S5): the loser's own arrival carrying it, or, the same winner relabelled an exit, the loser
 * where they already stand (`relabelCarryReason`), whom the direction does not place again
 */
export function carriedFor(
  view: OutcomeView,
  args: PlanArgs,
  loser?: DirectionPlan['loser'],
): { relay: OutcomeOp[]; landing: OutcomeOp[] } {
  const write = args.write as MatchUpWrite;
  if (loser?.arrives) return carriedOps(view, args.request, write, loser);
  const relabelled =
    reentersWinner(view, args.route, write) ||
    relabelsWhereWinnerStands(view, args.route, write) ||
    args.route === 'swap'
      ? args.direction?.loser
      : undefined;
  if (relabelled?.withdrawn) return { relay: [], landing: withdrawnOps(view) };
  if (!relabelled?.exit) return { relay: [], landing: [] };
  // the same exit entered again leaves the carry as it is: v1 writes the matchUp alone (S6 tail)
  if (view.targets.loserMatchUpCarryHeld && view.targets.loserMatchUpStatus === relabelled.exit)
    return { relay: [], landing: [] };
  const carried = carriedOps(view, args.request, write, relabelled);
  // nobody is placed, so no op names the loser's structure (`structureStamps`): v1's notice for the matchUp the carry
  // writes stamps it (`modifyMatchUpNotice`)
  const structureId = view.targets.loserStructureId;
  const stamp: OutcomeOp[] =
    structureId && structureId !== view.targets.source.structureId
      ? [{ op: 'stampUpdatedAt', entity: 'structure', id: structureId }]
      : [];
  return { relay: carried.relay, landing: [...carried.landing, ...stamp] };
}
