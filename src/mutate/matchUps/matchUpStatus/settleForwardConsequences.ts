import { carryExitOnward } from '@Mutate/matchUps/matchUpStatus/settleRederivedDoubleExits';
import { advanceDrawPosition } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { recordSettleEvent } from '@Mutate/matchUps/matchUpStatus/settleTelemetry';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { directWinner } from '@Mutate/matchUps/drawPositions/directWinner';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { directLoser } from '@Mutate/matchUps/drawPositions/directLoser';
import { isFedLoserEligible } from '@Query/matchUp/isFedLoserEligible';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { pushGlobalLog } from '@Functions/global/globalLog';
import { isExit } from '@Validators/isExit';

// constants and types
import type { DrawDefinition, Event, PositionAssignment, Tournament } from '@Types/tournamentTypes';
import type { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { LOSER } from '@Constants/drawDefinitionConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import { TEAM } from '@Constants/matchUpTypes';

/** the warning `setMatchUpStatus` returns when the pass stopped at its bound with something still owed */
export const FORWARD_SETTLE_EXHAUSTED = 'FORWARD_SETTLE_EXHAUSTED';

// each action seats, directs or reserves one position; a draw owes far fewer than this
const PASS_LIMIT = 64;

type SettleArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  propagateExitStatus?: boolean;
  event?: Event;
};

type Owed = { key: string; matchUpId: string; act: () => ResultType | undefined };

type Reading = {
  assignmentsOf: (structureId: string) => PositionAssignment[];
  byId: Map<string, HydratedMatchUp>;
  inContextDrawMatchUps: HydratedMatchUp[];
  /** `structureId|roundNumber` of every round a LOSER link leaves */
  loserRounds: Set<string>;
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  done: Set<string>;
} & Omit<SettleArgs, 'drawDefinition'>;

/**
 * WHAT FORWARD PLAY SENDS ON FROM A RESULT IS SENT ON FROM A RE-DERIVED ONE TOO.
 *
 * A removal re-derives the matchUp it vacates. Clearing a probe's double exit, or the BYE it placed, puts a matchUp back
 * to the exit it held before: a decided carried exit, an award, a pending produced exit (`removeDoubleExit` →
 * `removeDirectedBye` → `positionClear`'s `updateMatchUpStatusAfterRemoval`, and `removeDoubleExit`'s unwind). The
 * re-derivation writes the matchUp and stops there. What the same result sends on when it is entered forward is not
 * replayed: its winner is not advanced, its loser is not directed over the loser link, and a pending exit's reservation
 * is not made again. Census A1 (2026-10-17) measured it as group R1 in 18 of the 33 schedules whose do-undo round trip
 * did not return the draw: in every one the state forward play reaches from the standing results is the scheduled one,
 * so what the round trip left is residue.
 *
 * So this is asked of the SETTLED draw, as `settleRederivedDoubleExits` and `reconcileByeAdvancements` are: it needs no
 * record of which writer re-derived the matchUp, so a writer added later is covered too. Each question is answered by
 * the forward primitive itself (`directWinner`, `advanceDrawPosition`, `directLoser` and `carryExitOnward`), so the
 * answer is what forward play writes by construction:
 *
 *  1. A decided matchUp's winner stands in its next matchUp in the same structure. A participant goes on by
 *     `directWinner`. An empty seat goes on only as a double exit's same-structure advancement sends it
 *     (`doubleExitAdvancement`'s `advanceFromTarget`), which `directParticipants`' `winnerSlotEmpty` never does: "an
 *     award to an empty seat advances nobody". So all three of these hold: nobody stands on the losing side (the exit
 *     there was produced, not carried); that exit's origin feeds this matchUp directly over its winner or loser link,
 *     not relayed past a BYE (`relayedPastBye`); and the seat is structural, never an earlier round's advancement.
 *     Measured without the last two: the empty seat of a relayed exit was advanced where no entry order puts it.
 *     Cases 7, 8, 9, 10, 13 (R1a).
 *  2. A decided matchUp's losing participant stands in the structure its loser link targets. If not, `directLoser`
 *     places them, and `carryExitOnward` carries the exit on when the placement asks for it (`progressExitStatus`), as
 *     `setMatchUpStatus` does after a direction. A FIRST_MATCHUP link is asked only of a loser it feeds
 *     (`isFedLoserEligible`, the count `directLoser` makes): an ineligible loser is not in the consolation, and their
 *     seat's BYE is `reconcileConsolationReservations`' question. A loser target with no seat available to the loser is
 *     not asked: a seat taken by somebody else is not this pass's to move, and asking would turn a settle into a
 *     refusal over a written draw. Cases 0b, 1, 2, 3, 4, 5, 12, 15 and 28 (R1b; in 28 the loser had left the draw).
 *  3. A pending exit holding one lone empty drawPosition, whose exit arrived directly from its origin (the same
 *     double-exit branch), has advanced that seat as the reservation for the arrival it awaits (`advanceDrawPosition`).
 *     Never through a relayed exit: a reservation made past a BYE is the BYE's, and is released with it ("a pending
 *     exit's reservation goes with it"). Cases 16, 19, 23, 30 (R1c).
 *
 * The questions are asked in one walk of the draw and the first owed answer is acted on; the draw is then read again,
 * since an advance can owe another one a round on. Each question about a matchUp and a position acts at most once in a
 * call, so an answer that writes nothing cannot loop, and the pass stops at `PASS_LIMIT`. Stopping there with something
 * still owed is never silent: it is logged and `exhausted` names the matchUp, which `setMatchUpStatus` returns as a
 * `FORWARD_SETTLE_EXHAUSTED` warning.
 *
 * Not asked: a TEAM dual, whose lineUps a direction carries (a line is directed by its dual); a lucky draw, whose
 * pre-feed rounds defer advancement to the director (`directParticipants`' `shouldAdvance`); a round robin, which has
 * no winner or loser links.
 */
export function settleForwardConsequences(
  params: SettleArgs,
): (ResultType & { exhausted?: string; settled?: number }) | undefined {
  const { drawDefinition } = params;
  if (!drawDefinition || isLuckyBasedDraw(drawDefinition.drawType)) return undefined;
  const done = new Set<string>();
  for (let pass = 0; pass < PASS_LIMIT; pass += 1) {
    const owed = findOwed({ ...params, drawDefinition, done });
    if (!owed) return pass ? { settled: pass } : undefined;
    done.add(owed.key);
    const result = owed.act();
    if (result?.error) return result;
  }
  const owed = findOwed({ ...params, drawDefinition, done });
  if (!owed) return { settled: PASS_LIMIT };
  pushGlobalLog({ method: 'settleForwardConsequences', color: 'brightred', exhausted: owed.key });
  recordSettleEvent({ kind: 'bound', site: 'settleForwardConsequences', detail: owed.matchUpId });
  return { exhausted: owed.matchUpId, settled: PASS_LIMIT };
}

/**
 * THE PASS'S DETECTOR: whether the draw owes a forward answer. The pass acts on each `findOwed` finds; v2's has-work
 * predicate (`outcome/settleWork.ts`) asks this of the working view, so the two cannot drift.
 */
export function hasForwardWork(params: SettleArgs): boolean {
  const { drawDefinition } = params;
  if (!drawDefinition || isLuckyBasedDraw(drawDefinition.drawType)) return false;
  return !!findOwed({ ...params, drawDefinition, done: new Set() });
}

function findOwed(params: SettleArgs & { drawDefinition: DrawDefinition; done: Set<string> }): Owed | undefined {
  const { drawDefinition } = params;
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const inContextDrawMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap }).matchUps ?? [];
  const assignments = new Map<string, PositionAssignment[]>();
  const reading: Reading = {
    ...params,
    byId: new Map(inContextDrawMatchUps.map((matchUp) => [matchUp.matchUpId, matchUp])),
    assignmentsOf: (structureId) => {
      if (!assignments.has(structureId))
        assignments.set(structureId, getPositionAssignments({ drawDefinition, structureId }).positionAssignments ?? []);
      return assignments.get(structureId) ?? [];
    },
    loserRounds: new Set(
      (drawDefinition.links ?? [])
        .filter((link) => link.linkType === LOSER)
        .map((link) => `${link.source.structureId}|${link.source.roundNumber}`),
    ),
    inContextDrawMatchUps,
    matchUpsMap,
  };
  for (const matchUp of inContextDrawMatchUps) {
    if (matchUp.collectionId || matchUp.matchUpType === TEAM || !matchUp.sides) continue;
    const owed =
      owedWinnerAdvance(reading, matchUp) ?? owedReservation(reading, matchUp) ?? owedLoser(reading, matchUp);
    if (owed) return owed;
  }
  return undefined;
}

const positionsOf = (matchUp?: HydratedMatchUp): number[] =>
  (matchUp?.sides ?? [])
    .map((side) => side?.drawPosition)
    .filter((drawPosition): drawPosition is number => !!drawPosition);

/** the next matchUp in the same structure, when it has a seat this matchUp has not already sent someone into */
function openNextMatchUp(reading: Reading, matchUp: HydratedMatchUp): HydratedMatchUp | undefined {
  const next = matchUp.winnerMatchUpId ? reading.byId.get(matchUp.winnerMatchUpId) : undefined;
  if (next?.structureId !== matchUp.structureId) return undefined;
  const held = positionsOf(next);
  if (held.length >= 2) return undefined;
  const own = positionsOf(matchUp);
  return held.some((drawPosition) => own.includes(drawPosition)) ? undefined : next;
}

/** the exit recorded at `sideNumber` came straight down its origin's winner or loser link, not relayed past a BYE */
function arrivedDirectly(reading: Reading, matchUp: HydratedMatchUp, sideNumber?: number): boolean {
  const entry = sideNumber ? matchUp.sideExitProvenance?.[sideNumber] : undefined;
  const origin = entry?.sourceMatchUpId ? reading.byId.get(entry.sourceMatchUpId) : undefined;
  return !!origin && (origin.winnerMatchUpId === matchUp.matchUpId || origin.loserMatchUpId === matchUp.matchUpId);
}

/** the position entered the structure in this matchUp's round: no earlier round of the structure holds it */
function isStructuralSeat(reading: Reading, matchUp: HydratedMatchUp, drawPosition: number): boolean {
  return !reading.inContextDrawMatchUps.some(
    (other) =>
      other.structureId === matchUp.structureId &&
      (other.roundNumber ?? 0) < (matchUp.roundNumber ?? 0) &&
      positionsOf(other).includes(drawPosition),
  );
}

function advanceSeat(reading: Reading, matchUp: HydratedMatchUp, drawPosition: number) {
  return () =>
    advanceDrawPosition({
      inContextDrawMatchUps: reading.inContextDrawMatchUps,
      tournamentRecord: reading.tournamentRecord,
      drawDefinition: reading.drawDefinition,
      drawPositionToAdvance: drawPosition,
      matchUpsMap: reading.matchUpsMap,
      matchUpId: matchUp.matchUpId,
      event: reading.event,
    });
}

/** question 1: a decided matchUp's winner stands in its next matchUp */
function owedWinnerAdvance(reading: Reading, matchUp: HydratedMatchUp): Owed | undefined {
  if (!matchUp.winningSide) return undefined;
  const next = openNextMatchUp(reading, matchUp);
  if (!next) return undefined;
  const winner = matchUp.sides?.find((side) => side.sideNumber === matchUp.winningSide);
  const drawPosition = winner?.drawPosition;
  const key = `winner:${matchUp.matchUpId}:${drawPosition}`;
  if (!drawPosition || reading.done.has(key)) return undefined;
  const seat = reading
    .assignmentsOf(matchUp.structureId)
    .find((assignment) => assignment.drawPosition === drawPosition);
  if (seat?.bye) return undefined;

  if (winner.participantId) {
    return { key, matchUpId: matchUp.matchUpId, act: () => directStandingWinner(reading, matchUp, drawPosition) };
  }

  const loser = matchUp.sides?.find((side) => side.sideNumber !== matchUp.winningSide);
  const emptySeatAdvances =
    isExit(matchUp.matchUpStatus) &&
    !seat?.participantId &&
    !loser?.participantId &&
    !loser?.bye &&
    arrivedDirectly(reading, matchUp, loser?.sideNumber) &&
    isStructuralSeat(reading, matchUp, drawPosition);
  return emptySeatAdvances
    ? { key, matchUpId: matchUp.matchUpId, act: advanceSeat(reading, matchUp, drawPosition) }
    : undefined;
}

function directStandingWinner(reading: Reading, matchUp: HydratedMatchUp, drawPosition: number) {
  const { inContextDrawMatchUps, drawDefinition } = reading;
  const targets = positionTargets({ matchUpId: matchUp.matchUpId, inContextDrawMatchUps, drawDefinition });
  if (targets.error) return targets;
  return directWinner({
    winnerMatchUpDrawPositionIndex: targets.targetMatchUps?.winnerMatchUpDrawPositionIndex,
    winnerTargetLink: targets.targetLinks?.winnerTargetLink,
    winnerMatchUp: targets.targetMatchUps?.winnerMatchUp,
    tournamentRecord: reading.tournamentRecord,
    sourceMatchUpStatus: matchUp.matchUpStatus,
    matchUpsMap: reading.matchUpsMap,
    sourceMatchUpId: matchUp.matchUpId,
    winningDrawPosition: drawPosition,
    projectedWinningSide: undefined,
    dualMatchUp: undefined,
    inContextDrawMatchUps,
    event: reading.event,
    drawDefinition,
  });
}

/** question 3: a pending exit beside one lone empty seat has advanced it, when its exit came straight from its origin */
function owedReservation(reading: Reading, matchUp: HydratedMatchUp): Owed | undefined {
  if (matchUp.winningSide || !isExit(matchUp.matchUpStatus)) return undefined;
  const held = positionsOf(matchUp);
  if (held.length !== 1 || !openNextMatchUp(reading, matchUp)) return undefined;
  const [drawPosition] = held;
  const key = `reservation:${matchUp.matchUpId}:${drawPosition}`;
  if (reading.done.has(key)) return undefined;
  const seat = reading
    .assignmentsOf(matchUp.structureId)
    .find((assignment) => assignment.drawPosition === drawPosition);
  if (seat?.participantId || seat?.bye) return undefined;
  const direct = [1, 2].some(
    (sideNumber) =>
      matchUp.sideExitProvenance?.[sideNumber]?.matchUpStatus && arrivedDirectly(reading, matchUp, sideNumber),
  );
  return direct ? { key, matchUpId: matchUp.matchUpId, act: advanceSeat(reading, matchUp, drawPosition) } : undefined;
}

/** question 2: a decided matchUp's losing participant stands in the structure its loser link targets */
function owedLoser(reading: Reading, matchUp: HydratedMatchUp): Owed | undefined {
  if (!matchUp.winningSide || !reading.loserRounds.has(`${matchUp.structureId}|${matchUp.roundNumber}`))
    return undefined;
  const loser = matchUp.sides?.find((side) => side.sideNumber !== matchUp.winningSide);
  const loserParticipantId = loser?.participantId;
  if (!loserParticipantId || loser.bye || !loser.drawPosition) return undefined;
  const key = `loser:${matchUp.matchUpId}:${loserParticipantId}`;
  if (reading.done.has(key)) return undefined;

  const { inContextDrawMatchUps, drawDefinition } = reading;
  const targets = positionTargets({ matchUpId: matchUp.matchUpId, inContextDrawMatchUps, drawDefinition });
  const loserMatchUp = targets.targetMatchUps?.loserMatchUp;
  const loserTargetLink = targets.targetLinks?.loserTargetLink;
  if (!loserMatchUp || !loserTargetLink) return undefined;
  const targetAssignments = reading.assignmentsOf(loserTargetLink.target.structureId);
  if (targetAssignments.some((assignment) => assignment.participantId === loserParticipantId)) return undefined;

  const sourceMatchUps = inContextDrawMatchUps.filter((other) => other.structureId === matchUp.structureId);
  if (!isFedLoserEligible({ sourceMatchUps, loserDrawPosition: loser.drawPosition, loserTargetLink })) return undefined;
  // a seat the loser can take, as `directLoser` reads availability: nobody there, or a BYE the cascade placed
  const targetPositions = positionsOf(loserMatchUp);
  const seatAvailable = targetAssignments.some(
    (assignment) =>
      targetPositions.includes(assignment.drawPosition) &&
      !assignment.participantId &&
      !assignment.qualifier &&
      (!assignment.bye || assignment.byeFromPropagation),
  );
  if (!seatAvailable) return undefined;

  const act = () => {
    const directed = directLoser({
      loserMatchUpDrawPositionIndex: targets.targetMatchUps?.loserMatchUpDrawPositionIndex,
      propagateExitStatus: reading.propagateExitStatus,
      tournamentRecord: reading.tournamentRecord,
      sourceMatchUpStatus: matchUp.matchUpStatus,
      sourceWinningSide: matchUp.winningSide,
      winningSide: matchUp.winningSide,
      matchUpsMap: reading.matchUpsMap,
      sourceMatchUpId: matchUp.matchUpId,
      loserDrawPosition: loser.drawPosition,
      sourceMatchUpStatusCodes: [],
      projectedWinningSide: undefined,
      dualMatchUp: undefined,
      inContextDrawMatchUps,
      event: reading.event,
      loserTargetLink,
      drawDefinition,
      loserMatchUp,
    });
    if (directed.error || !directed.context?.progressExitStatus) return directed;
    return carryExitOnward({
      context: {
        loserMatchUp: reading.matchUpsMap.drawMatchUps.find((stored) => stored.matchUpId === loserMatchUp.matchUpId),
        sourceMatchUpStatus: matchUp.matchUpStatus,
        sourceWinningSide: matchUp.winningSide,
        matchUpsMap: reading.matchUpsMap,
        sourceMatchUpId: matchUp.matchUpId,
        sourceMatchUpStatusCodes: [],
        loserParticipantId,
      },
      propagateExitStatus: reading.propagateExitStatus,
      tournamentRecord: reading.tournamentRecord,
      drawDefinition,
      event: reading.event,
    });
  };
  return { key, matchUpId: matchUp.matchUpId, act };
}
