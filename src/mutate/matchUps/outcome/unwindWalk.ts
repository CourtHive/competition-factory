import { SETTLE_PASS_LIMITS } from '@Mutate/matchUps/matchUpStatus/settleBounds';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { matchUpsOf, positionAssignmentsOf } from '@Acquire/structureMembers';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { isAnyExit, isDoubleExit } from '@Validators/isExit';
import { overlap } from '@Tools/arrays';

import { BYE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { CONTAINER, WINNER } from '@Constants/drawDefinitionConstants';
import type { DrawDefinition, MatchUp, MatchUpStatusUnion } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import type { RoundProfile } from '@Types/factoryTypes';
import type { OutcomeOp } from './ops';

/**
 * THE UNWIND WALK (S6 tail): v1's removal of a propagated BYE (`removeDirectedBye` → `clearDrawPosition` →
 * `drawPositionRemovals`, with `releaseUndecidedAdvancements`, `releaseAdvancedDrawPosition`'s vacated-BYE recursion and
 * `handleLoserMatchUpRemoval`'s loser cascade) run on a copy of the draw, as the BYE walk (`byeWalk`) runs v1's
 * placement. It covers the plain recursion: every matchUp it reaches holds no result, score, codes or provenance, a BYE
 * or to be played, and it crosses no winner link. It abstains (undefined) wherever v1 would take another branch: a
 * participant cleared, a carry brought home, a TEAM line-up, a hole's carry, a round robin, a write v1 makes without a
 * notice, a BYE advance owed after it (`reconcileByeAdvancements`), or a walk longer than v1's own bound allows.
 *
 * Mentat planning/OUTCOME_V2_UNWIND_BYE_RECURSION.md holds v1's recursion distilled and the notice rule: a visit is
 * announced unless the matchUp's positions at that visit include the removed one and nothing else of it changed.
 */

type SimMatchUp = {
  matchUpId: string;
  structureId: string;
  roundNumber?: number;
  roundPosition?: number;
  /** the positions the matchUp holds as the walk goes (`drawPositions` on the copy v1 writes) */
  positions: number[];
  matchUpStatus?: MatchUpStatusUnion;
  stored: HydratedMatchUp;
};

type Notice = { context: 'remove' | 'release'; drawPosition: number; segment: number };

type Sim = {
  drawDefinition: DrawDefinition;
  inContextDrawMatchUps: HydratedMatchUp[];
  byId: Map<string, SimMatchUp>;
  byStructure: Map<string, SimMatchUp[]>;
  byes: Set<string>;
  participants: Set<string>;
  winnerLinkRounds: Set<string>;
  propagatesBye: boolean;
  notices: Map<string, Notice>;
  initial: Map<string, { positions: number[]; matchUpStatus?: MatchUpStatusUnion }>;
  withdrawn: { structureId: string; drawPosition: number; quiet: boolean; segment: number }[];
  segment: number;
  steps: number;
  failed: boolean;
};

const seatKey = (structureId: string, drawPosition: number) => `${structureId}|${drawPosition}`;
const roundKey = (structureId: string, roundNumber?: number) => `${structureId}|${roundNumber}`;
const positionsOf = (positions?: (number | undefined)[]) =>
  (positions ?? []).filter((position): position is number => !!position).sort((a, b) => a - b);

/** a matchUp the walk may write: a BYE or to be played, holding nothing of a result */
function clean(matchUp: SimMatchUp): boolean {
  const { stored } = matchUp;
  return (
    (matchUp.matchUpStatus === TO_BE_PLAYED || matchUp.matchUpStatus === BYE) &&
    !stored.winningSide &&
    !checkScoreHasValue({ score: stored.score }) &&
    !stored.matchUpStatusCodes?.length &&
    !Object.keys(stored.sideExitProvenance ?? {}).length &&
    !stored.sides?.some((side) => (side as { lineUp?: unknown[] } | undefined)?.lineUp?.length)
  );
}

function fail(sim: Sim): false {
  sim.failed = true;
  return false;
}

function announce(sim: Sim, matchUpId: string, notice: Omit<Notice, 'segment'>) {
  // v1's notice buffer keeps a matchUp re-announced later in the call at that later place, with the later context
  sim.notices.delete(matchUpId);
  sim.notices.set(matchUpId, { ...notice, segment: sim.segment });
}

const initialRound = (matchUps: SimMatchUp[], drawPosition?: number) =>
  drawPosition
    ? matchUps
        .filter((matchUp) => matchUp.positions.includes(drawPosition))
        .map(({ roundNumber }) => roundNumber ?? 0)
        .sort((a, b) => a - b)[0]
    : undefined;

/** the latest earlier round of the structure holding the position: the matchUp that delivered it */
function latestFeeder(matchUps: SimMatchUp[], matchUp: SimMatchUp, drawPosition: number) {
  const feeders = matchUps.filter(
    (candidate) =>
      (candidate.roundNumber ?? 0) < (matchUp.roundNumber ?? 0) && candidate.positions.includes(drawPosition),
  );
  return feeders.length
    ? feeders.reduce((latest, candidate) =>
        (candidate.roundNumber ?? 0) > (latest.roundNumber ?? 0) ? candidate : latest,
      )
    : undefined;
}

/** v1's `clearDrawPosition` (`announced`, its structure's assignments announced) or `drawPositionRemovals` alone */
function clearSeat(sim: Sim, structureId: string, drawPosition: number, announced: boolean): boolean {
  if (!sim.byes.has(seatKey(structureId, drawPosition))) return fail(sim);
  sim.withdrawn.push({ structureId, drawPosition, quiet: !announced, segment: sim.segment });
  return removals(sim, structureId, drawPosition);
}

type Pairing = {
  roundNumber: number;
  targetDrawPosition: number;
  pairedDrawPosition?: number;
  relevantPair: (number | undefined)[];
  byeAdvancedPair?: (number | undefined)[];
};

type RoundPairs = { pairedDrawPositions?: (number | undefined)[][]; matchUpsCount?: number };

/** v1's `holeCarriedOnto`: the pair of the next round a lone matchUp feeds, structurally, while it holds a hole too */
function holeCarriedOnto(relevantPair: (number | undefined)[], profile?: RoundPairs, nextProfile?: RoundPairs) {
  const index = profile?.pairedDrawPositions?.findIndex((pair) => pair === relevantPair) ?? -1;
  const nextPairs = nextProfile?.pairedDrawPositions;
  if (index < 0 || !nextPairs?.length) return undefined;
  const chunkFactor = (profile?.matchUpsCount ?? 0) / (nextProfile?.matchUpsCount ?? 0);
  if (!Number.isInteger(chunkFactor) || chunkFactor < 1) return undefined;
  const fedPair = nextPairs[Math.floor(index / chunkFactor)];
  return fedPair?.some((position) => !position) ? fedPair : undefined;
}

/** v1's `buildPairingDetails`: every round of the structure, a BYE partner standing in the next round transitive */
function pairingDetails(
  sim: Sim,
  structureId: string,
  drawPosition: number,
  roundProfile: RoundProfile = {},
): Pairing[] {
  const roundNumbers = Object.keys(roundProfile).map(Number);
  let target = drawPosition;
  const details: Pairing[] = [];
  for (const roundNumber of roundNumbers) {
    const profile = roundProfile[roundNumber];
    const relevantPair = profile?.pairedDrawPositions?.find((pair: (number | undefined)[]) => pair.includes(target));
    if (!relevantPair) continue;
    const paired = relevantPair.find((position: number | undefined) => position !== target);
    const nextProfile = roundProfile[roundNumber + 1];
    // a hole's partner: what it carried on is looked for in the matchUp its own matchUp feeds (`holeCarriedOnto`)
    if (!paired) {
      const fedPair = holeCarriedOnto(relevantPair, profile, nextProfile);
      details.push({
        roundNumber,
        targetDrawPosition: target,
        relevantPair,
        ...(fedPair ? { byeAdvancedPair: fedPair } : {}),
      });
      continue;
    }
    const inNext = nextProfile?.pairedDrawPositions?.find((pair: (number | undefined)[]) => pair.includes(paired));
    const transitive =
      sim.byes.has(seatKey(structureId, paired)) && !!inNext && nextProfile?.drawPositions?.includes(paired);
    details.push({
      roundNumber,
      targetDrawPosition: target,
      pairedDrawPosition: paired,
      relevantPair,
      ...(!transitive && inNext ? { byeAdvancedPair: inNext } : {}),
    });
    if (transitive) target = paired;
  }
  return details;
}

/** v1's `drawPositionRemovals`: the seat emptied, then the removal tasks the pairing builds, each in its round */
function removals(sim: Sim, structureId: string, drawPosition: number): boolean {
  sim.steps += 1;
  if (sim.steps > SETTLE_PASS_LIMITS.exitLevels * 8) return fail(sim);
  const structure = sim.drawDefinition.structures?.find((candidate) => candidate.structureId === structureId);
  if (!structure || structure.structureType === CONTAINER) return fail(sim);
  const key = seatKey(structureId, drawPosition);
  // a participant cleared releases what winner links carried for them (`releaseAcrossWinnerLinks`): v1's
  if (sim.participants.has(key)) return fail(sim);
  const clearedBye = sim.byes.delete(key);
  const matchUps = sim.byStructure.get(structureId) ?? [];
  const live = matchUps.map((matchUp) => ({ ...matchUp.stored, drawPositions: matchUp.positions }));
  const { roundProfile, roundMatchUps } = getRoundMatchUps({ matchUps: live as unknown as MatchUp[] });
  const details = pairingDetails(sim, structureId, drawPosition, roundProfile);
  const tasks = details.flatMap((detail) => [
    { roundNumber: detail.roundNumber, target: detail.targetDrawPosition, pair: detail.relevantPair },
    ...(detail.byeAdvancedPair
      ? [{ roundNumber: detail.roundNumber + 1, target: detail.pairedDrawPosition, pair: detail.byeAdvancedPair }]
      : []),
  ]);
  for (const { roundNumber, target, pair } of tasks) {
    // each task finds its matchUp by the positions it holds now: an earlier task's release can leave it nothing
    const ids = new Set((roundMatchUps?.[roundNumber] ?? []).map((matchUp) => matchUp.matchUpId));
    const targetMatchUp = matchUps.find(
      (matchUp) => ids.has(matchUp.matchUpId) && overlap(matchUp.positions, positionsOf(pair)),
    );
    if (!targetMatchUp) continue;
    // a hole's task names no position to take out of later rounds (stored positions hold no hole)
    if (target && !subsequentRounds(sim, matchUps, target, roundNumber)) return false;
    if (!removeDrawPosition(sim, matchUps, targetMatchUp, drawPosition)) return false;
  }
  // a BYE in the structure's last round advanced its pair across a WINNER link (`releaseLinkedWinnerAdvancement`): v1's
  if (clearedBye) {
    for (const { roundNumber, pairedDrawPosition } of details) {
      if (
        pairedDrawPosition &&
        !roundProfile?.[roundNumber + 1] &&
        sim.winnerLinkRounds.has(roundKey(structureId, roundNumber))
      )
        return fail(sim);
    }
  }
  return !sim.failed;
}

/** v1's `removeSubsequentRoundsParticipant`: the position out of every later round holding it, past its first */
function subsequentRounds(sim: Sim, matchUps: SimMatchUp[], target: number, roundNumber: number): boolean {
  const first = initialRound(matchUps, target);
  const relevant = matchUps.filter(
    (matchUp) =>
      (matchUp.roundNumber ?? 0) >= roundNumber && matchUp.roundNumber !== first && matchUp.positions.includes(target),
  );
  return relevant.every((matchUp) => removeDrawPosition(sim, matchUps, matchUp, target));
}

/** the position reached this matchUp because its opponent in the feeding matchUp is a BYE (`advancedByOpponentsBye`) */
function advancedByOpponentsBye(sim: Sim, matchUps: SimMatchUp[], matchUp: SimMatchUp, drawPosition: number) {
  const feeder = latestFeeder(matchUps, matchUp, drawPosition);
  return !!feeder?.positions.some(
    (position) => position !== drawPosition && sim.byes.has(seatKey(matchUp.structureId, position)),
  );
}

/** v1's `removeDrawPosition`, its status after the removal, the undecided advancements released, the loser cascade */
function removeDrawPosition(sim: Sim, matchUps: SimMatchUp[], matchUp: SimMatchUp, drawPosition: number): boolean {
  if (!clean(matchUp)) return fail(sim);
  const { structureId } = matchUp;
  const initialPositions = matchUp.positions.slice();
  const initialStatus = matchUp.matchUpStatus;
  const first = initialRound(matchUps, drawPosition);
  const keeps = advancedByOpponentsBye(sim, matchUps, matchUp, drawPosition);
  if (!keeps && first && (matchUp.roundNumber ?? 0) > first) {
    matchUp.positions = matchUp.positions.filter((position) => position !== drawPosition);
    // the position across a WINNER link out of this round (`releaseLinkedWinnerAdvancement`): v1's
    if (sim.winnerLinkRounds.has(roundKey(structureId, matchUp.roundNumber))) return fail(sim);
  }
  const containsBye = matchUp.positions.some((position) => sim.byes.has(seatKey(structureId, position)));
  matchUp.matchUpStatus = containsBye ? BYE : TO_BE_PLAYED;
  const noChange = initialPositions.includes(drawPosition) && initialStatus === matchUp.matchUpStatus;
  if (!noChange) announce(sim, matchUp.matchUpId, { context: 'remove', drawPosition });
  // a write v1 makes with no notice (the positions changed, nothing else): no op announces nothing
  else if (initialPositions.length !== matchUp.positions.length) return fail(sim);
  if (!releaseUndecided(sim, matchUp, drawPosition, initialPositions, initialStatus)) return false;
  return containsBye || loserCascade(sim, matchUp);
}

/** v1's `releaseUndecidedAdvancements`: a matchUp left to be played that was a BYE releases what it advanced */
function releaseUndecided(
  sim: Sim,
  matchUp: SimMatchUp,
  drawPosition: number,
  initialPositions: number[],
  initialStatus?: MatchUpStatusUnion,
): boolean {
  if (!matchUp.roundNumber || matchUp.matchUpStatus !== TO_BE_PLAYED) return true;
  if (initialStatus !== BYE && !isAnyExit(initialStatus)) return true;
  for (const advanced of initialPositions) {
    if (advanced === drawPosition) continue;
    if (!release(sim, matchUp.structureId, matchUp.roundNumber + 1, advanced)) return false;
  }
  return true;
}

/** v1's `releaseAdvancedDrawPositionAcrossLinks` (`withdrawingExit`) on matchUps holding nothing of a result */
function release(sim: Sim, structureId: string, fromRoundNumber: number, drawPosition: number): boolean {
  sim.steps += 1;
  if (sim.steps > SETTLE_PASS_LIMITS.exitLevels * 8) return fail(sim);
  const matchUps = sim.byStructure.get(structureId) ?? [];
  const first = initialRound(matchUps, drawPosition);
  const isBye = sim.byes.has(seatKey(structureId, drawPosition));
  const releasable = matchUps.filter(
    (matchUp) =>
      (matchUp.roundNumber ?? 0) >= fromRoundNumber &&
      matchUp.roundNumber !== first &&
      matchUp.positions.includes(drawPosition),
  );
  const releasedRounds: number[] = [];
  for (const matchUp of releasable) {
    if (!clean(matchUp)) return fail(sim);
    // a position advanced by a BYE is never released (`advancedByBye`), and a BYE's release vacates a BYE matchUp and
    // recurses on what stays (`vacatedByes`): v1's
    const feeder = latestFeeder(matchUps, matchUp, drawPosition);
    if (isBye || feeder?.positions.some((position) => sim.byes.has(seatKey(structureId, position)))) return fail(sim);
    matchUp.positions = matchUp.positions.filter((position) => position !== drawPosition);
    releasedRounds.push(matchUp.roundNumber ?? 0);
    announce(sim, matchUp.matchUpId, { context: 'release', drawPosition });
  }
  // released rounds release across WINNER links (`releaseLinkedWinnerAdvancement`): v1's
  if (releasedRounds.some((roundNumber) => sim.winnerLinkRounds.has(roundKey(structureId, roundNumber))))
    return fail(sim);
  return true;
}

/**
 * does a BYE on this loser seat still stand (`byeSeatStands`): only where no feeder of the seat sends nobody is the
 * answer the plain one (no). A feeder that sends nobody (`feederSendsNobody`: it holds a BYE, is a double exit, decided
 * with nobody to lose, or holds a pending produced exit), a link condition, or a feeder holding a result is v1's
 */
function seatFree(sim: Sim, structureId: string, drawPosition: number): boolean {
  if (!sim.byes.has(seatKey(structureId, drawPosition))) return true;
  for (const feeder of sim.inContextDrawMatchUps) {
    if (!feeder.loserMatchUpId || feeder.collectionId) continue;
    const { targetMatchUps, targetLinks } =
      positionTargets({
        matchUpId: feeder.matchUpId,
        inContextDrawMatchUps: sim.inContextDrawMatchUps,
        drawDefinition: sim.drawDefinition,
      }) ?? {};
    if (targetMatchUps?.loserMatchUp?.structureId !== structureId) continue;
    if (targetMatchUps.loserTargetDrawPosition !== drawPosition) continue;
    const live = sim.byId.get(feeder.matchUpId);
    if (targetLinks?.loserTargetLink?.linkCondition || !live || !clean(live)) return false;
    const holdsBye = live.positions.some((position) => sim.byes.has(seatKey(live.structureId, position)));
    if (holdsBye || isDoubleExit(live.matchUpStatus)) return false;
  }
  return true;
}

/** v1's `handleLoserMatchUpRemoval`: a matchUp left with no BYE takes back the BYE it sent to its loser seat */
function loserCascade(sim: Sim, matchUp: SimMatchUp): boolean {
  if (!matchUp.stored.loserMatchUpId) return true;
  const { targetMatchUps } =
    positionTargets({
      matchUpId: matchUp.matchUpId,
      inContextDrawMatchUps: sim.inContextDrawMatchUps,
      drawDefinition: sim.drawDefinition,
    }) ?? {};
  const loserMatchUp = targetMatchUps?.loserMatchUp && sim.byId.get(targetMatchUps.loserMatchUp.matchUpId);
  if (!loserMatchUp) return fail(sim);
  if (loserMatchUp.structureId === matchUp.structureId) return true;
  const { structureId } = loserMatchUp;
  // a fed seat (`consolationCleanup`) is v1's
  if (loserMatchUp.roundNumber !== 1) return fail(sim);
  const drawPosition = targetMatchUps?.loserTargetDrawPosition;
  if (!drawPosition || !seatFree(sim, structureId, drawPosition)) return fail(sim);
  // the round-1 cascade clears the seat whatever it holds: a BYE is withdrawn; an empty seat (a consolation's, before any
  // loser arrives) has its removal tasks run too, which change nothing (the seat's position went on only through a BYE
  // opposite, which keeps it: `advancedByOpponentsBye`); a participant there is v1's
  if (sim.byes.has(seatKey(structureId, drawPosition))) return clearSeat(sim, structureId, drawPosition, false);
  return !sim.participants.has(seatKey(structureId, drawPosition)) || fail(sim);
}

/** a BYE advance `reconcileByeAdvancements` owes after the call: a BYE matchUp whose other position has not gone on */
function owesByeAdvance(sim: Sim): boolean {
  for (const matchUp of sim.byId.values()) {
    const next = matchUp.stored.winnerMatchUpId && sim.byId.get(matchUp.stored.winnerMatchUpId);
    if (!next || next.structureId !== matchUp.structureId) continue;
    const byes = matchUp.positions.filter((position) => sim.byes.has(seatKey(matchUp.structureId, position)));
    const other = matchUp.positions.find((position) => !sim.byes.has(seatKey(matchUp.structureId, position)));
    if (byes.length !== 1 || !other) continue;
    if (next.positions.length < 2 && !next.positions.includes(other)) return true;
  }
  return false;
}

export type UnwindSeat = { structureId: string; drawPosition: number };

/**
 * The ops of v1's removal of the BYEs at these seats, walked in v1's order (the produced exit's unfillable seat first,
 * then the double exit's own), one list per seat: the assignments it withdrew (its structure announced), then each matchUp
 * whose last notice it wrote, in the order v1's notice buffer leaves them, with that notice's context. Undefined where the
 * walk abstains.
 */
export function unwindWalk({
  inContextDrawMatchUps,
  drawDefinition,
  propagatesBye,
  seats,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  propagatesBye: boolean;
  seats: UnwindSeat[];
}): OutcomeOp[][] | undefined {
  const sim: Sim = {
    drawDefinition,
    inContextDrawMatchUps,
    byId: new Map(),
    byStructure: new Map(),
    byes: new Set(),
    participants: new Set(),
    winnerLinkRounds: new Set(
      (drawDefinition.links ?? [])
        .filter((link) => link.linkType === WINNER)
        .map((link) => roundKey(link.source.structureId, link.source.roundNumber)),
    ),
    propagatesBye,
    notices: new Map(),
    initial: new Map(),
    withdrawn: [],
    segment: 0,
    steps: 0,
    failed: false,
  };
  const inContext = new Map(inContextDrawMatchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));
  for (const structure of drawDefinition.structures ?? []) {
    if (structure.structureType === CONTAINER) continue;
    const list: SimMatchUp[] = [];
    for (const raw of matchUpsOf(structure) ?? []) {
      const stored = inContext.get(raw.matchUpId);
      if (!stored || stored.collectionId) continue;
      const matchUp: SimMatchUp = {
        matchUpId: raw.matchUpId,
        structureId: structure.structureId,
        roundNumber: raw.roundNumber,
        roundPosition: raw.roundPosition,
        positions: positionsOf(raw.drawPositions),
        matchUpStatus: raw.matchUpStatus,
        stored,
      };
      list.push(matchUp);
      sim.byId.set(matchUp.matchUpId, matchUp);
      sim.initial.set(matchUp.matchUpId, { positions: matchUp.positions, matchUpStatus: raw.matchUpStatus });
    }
    sim.byStructure.set(structure.structureId, list);
    for (const assignment of positionAssignmentsOf(structure) ?? []) {
      const key = seatKey(structure.structureId, assignment.drawPosition);
      if (assignment.bye) sim.byes.add(key);
      if (assignment.participantId) sim.participants.add(key);
    }
  }
  for (const [segment, { structureId, drawPosition }] of seats.entries()) {
    sim.segment = segment;
    if (!clearSeat(sim, structureId, drawPosition, true)) return undefined;
  }
  if (sim.failed || owesByeAdvance(sim)) return undefined;
  const segments: OutcomeOp[][] = seats.map(() => []);
  for (const { structureId, drawPosition, quiet, segment } of sim.withdrawn)
    segments[segment].push({
      op: 'withdrawBye',
      structureId,
      drawPosition,
      ...(quiet ? { announcesAssignments: false as const } : {}),
    });
  const stamped = new Set<string>();
  for (const [matchUpId, notice] of sim.notices) {
    const written = matchUpOps(sim, matchUpId, notice);
    if (!written) return undefined;
    segments[notice.segment].push(...written);
    // v1's notice stamps the matchUp's structure (`modifyMatchUpNotice`)
    const structureId = sim.byId.get(matchUpId)?.structureId;
    if (structureId && !stamped.has(structureId)) {
      stamped.add(structureId);
      segments[notice.segment].push({ op: 'stampUpdatedAt', entity: 'structure', id: structureId });
    }
  }
  return segments;
}

/** a matchUp the walk wrote, as it stands after the walk, announced with the context of its last notice */
function matchUpOps(sim: Sim, matchUpId: string, notice: Notice): OutcomeOp[] | undefined {
  const matchUp = sim.byId.get(matchUpId);
  const before = sim.initial.get(matchUpId);
  if (!matchUp || !before) return undefined;
  const ops: OutcomeOp[] = [];
  if (before.matchUpStatus === BYE && matchUp.matchUpStatus === TO_BE_PLAYED)
    ops.push({ op: 'clearMatchUpBye', matchUpId, drawPosition: notice.drawPosition });
  else if (before.matchUpStatus !== matchUp.matchUpStatus) return undefined;
  const positionsChanged = before.positions.join() !== matchUp.positions.join();
  if (notice.context === 'release') {
    ops.push({
      op: 'setMatchUpDrawPositions',
      matchUpId,
      drawPositions: matchUp.positions,
      releasedDrawPosition: notice.drawPosition,
      announcesContext: false,
    });
  } else if (positionsChanged || before.matchUpStatus === matchUp.matchUpStatus) {
    // a matchUp announced with nothing of it changed (the removed position already gone from it): v1's notice stands
    ops.push({
      op: 'setMatchUpDrawPositions',
      matchUpId,
      drawPositions: matchUp.positions,
      withdrawnByePosition: notice.drawPosition,
    });
  }
  ops.push({ op: 'stampUpdatedAt', entity: 'matchUp', id: matchUpId });
  return ops;
}
