import { generateTieMatchUpScore } from '@Assemblies/generators/tieMatchUpScore/generateTieMatchUpScore';
import { fedLoserPlacementRefusal } from '@Mutate/matchUps/drawPositions/reconcileFedLoserEligibility';
import { isValidMatchUpFormat, isWellFormedMatchUpFormat } from '@Validators/isValidMatchUpFormat';
import { hasPropagatedExitDownstream } from '@Query/drawDefinition/hasPropagatedExitDownstream';
import { getCompetitionPolicy } from '@Query/drawDefinition/competition/getCompetitionPolicy';
import { feedEligibilityChange } from '@Mutate/matchUps/matchUpStatus/feedEligibilityGuard';
import { matchUpsOf, positionAssignmentsOf, structuresOf } from '@Acquire/structureMembers';
import { getMappedStructureMatchUps, getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { correctionKindChange } from '@Mutate/matchUps/matchUpStatus/correctionKindGuard';
import { getProjectedDualWinningSide } from '@Query/matchUp/getProjectedDualWinningSide';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { getDrawPositionWinCount } from '@Query/matchUp/getDrawPositionWinCount';
import { resolveScoringFormat } from '@Query/hierarchical/resolveScoringFormat';
import { getTargetsDownstream } from '@Query/drawDefinition/isActiveDownstream';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { isDeciderStructure } from '@Query/drawDefinition/deciderStructures';
import { getPolicyDefinitions } from '@Query/extensions/getAppliedPolicies';
import { lastSetFormatIsTimed } from '@Query/matchUp/lastSetFormatisTimed';
import { isUnscoredOutcome } from '@Query/matchUp/getDrawPositionWinCount';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { getMalformedRoundLink } from '@Query/drawDefinition/linkGetter';
import { isRotatingPartnerDraw } from '@Validators/rotatingPartnerDraw';
import { addGoesTo, hasStoredGoesTo } from '@Query/matchUps/addGoesTo';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { buildStructuralIndex } from '@Query/matchUps/structuralIndex';
import { isAnyExit, isDoubleExit, isExit } from '@Validators/isExit';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import { teamLevelMatchUps } from '@Acquire/teamLevelMatchUps';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { isLucky } from '@Query/drawDefinition/isLucky';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { findStructure } from '@Acquire/findStructure';
import { isObject } from '@Tools/objects';
import { overlap } from '@Tools/arrays';
import {
  getSideExitProvenance,
  carriedExitStatus,
  isPropagatedExit,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import {
  relabelledPathFeedChanges,
  relabelledPathFeedRefusal,
} from '@Mutate/matchUps/drawPositions/relabelledPathFeeds';

// constants and types
import type { BuildViewArgs, OutcomeRequest, OutcomeView, Reservation, ThroughBye } from './types';
import { FIRST_MATCHUP, LOSER, WIN_RATIO } from '@Constants/drawDefinitionConstants';
import { BYE, COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { MatchUpsMap } from '@Types/factoryTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import { TEAM } from '@Constants/matchUpTypes';
import type {
  DrawDefinition,
  DrawLink,
  Event,
  MatchUp,
  MatchUpStatusUnion,
  PositionAssignment,
  Score,
  SideExitProvenanceEntry,
  Structure,
} from '@Types/tournamentTypes';
import {
  POLICY_TYPE_PROGRESSION,
  POLICY_TYPE_ROUND_ROBIN_TALLY,
  POLICY_TYPE_SCORING,
} from '@Constants/policyConstants';

/**
 * The outcome pipeline, v2: the view.
 *
 * Everything § 2 asks of the draw, answered once and read-only. The questions are asked through the
 * engine's QUERIES (`positionTargets`, `isActiveDownstream`, `hasPropagatedExitDownstream`,
 * `analyzeMatchUp`, …): a function that takes the draw and answers a question is a query and v2
 * calls it; a function that takes params and returns a result is the v1 pipeline and v2 imports
 * none of it. `feedEligibilityChange` is a predicate on the draw and sits on the query side of that
 * line despite its directory.
 *
 * Nothing here writes. v1's `handleTeamAutoCalc` stamps `disableAutoCalc` and ensures line-ups on
 * its way to a refusal; the view projects the dual's winner instead and leaves both to the apply.
 */

const LIVE_OR_UNSET = new Set<string | undefined>([undefined, TO_BE_PLAYED]);

/** § 2.1, as the spec states it: may an exit with one participant be awarded to the empty side? */
function exitAwardable(
  positionAssignments: PositionAssignment[],
  inContextMatchUp: HydratedMatchUp | undefined,
  winningSide?: number,
): boolean {
  const winnerSide = (inContextMatchUp?.sides ?? []).find((side) => side?.sideNumber === winningSide);
  if (winnerSide?.participantId) return false;
  if (winnerSide?.qualifier) return true;
  if (winnerSide?.bye) return false;
  if (winnerSide?.drawPosition === undefined) return true;
  const assignment = positionAssignments.find((entry) => entry.drawPosition === winnerSide.drawPosition);
  if (!assignment) return true;
  if (assignment.bye) return false;
  return !!(assignment.participantId || assignment.qualifier);
}

/**
 * The exit statuses carried into a matchUp from ELSEWHERE: an entry this matchUp produced is unwound
 * before it is re-entered (a re-scored double exit makes a single exit, not a convergence), so it is
 * not something a new exit converges with.
 */
function carriedStatuses(
  matchUp?: HydratedMatchUp,
  sourceMatchUpId?: string,
  draw?: DrawContext,
): MatchUpStatusUnion[] {
  return Object.entries(getSideExitProvenance({ matchUp }) ?? {})
    .filter(([, entry]) => entry?.sourceMatchUpId !== sourceMatchUpId)
    .filter(([sideNumber, entry]) => !arrivedByWinning(matchUp, Number(sideNumber), entry, draw))
    .map(([, entry]) => carriedExitStatus(entry))
    .filter((status): status is MatchUpStatusUnion => !!status);
}

type DrawContext = { inContextDrawMatchUps: HydratedMatchUp[]; drawDefinition: DrawDefinition };

/**
 * An entry that records how a side ARRIVED, not an exit standing on it.
 *
 * Records written before F9 (CA, 2026-10-07) stamped an arrival with its source's status, so a participant who won a
 * DEFAULTED carried `{ matchUpStatus: DEFAULTED, previousMatchUpStatus: DEFAULTED }` into the next round: the same
 * shape as the exit the loser of that DEFAULTED carries over the loser link. Only the link tells them apart. v1's
 * forward rules read the target's status and never saw the entry; this read did, and planned a convergence where a
 * present participant wins the produced exit (census w2 9100389, DE 8/8, `Main|2|2`). The writer now records an
 * arrival with no `matchUpStatus`, so on a current record `carriedExitStatus` already answers nothing for it; this
 * read remains for records that still carry the old shape.
 */
function arrivedByWinning(
  matchUp: HydratedMatchUp | undefined,
  sideNumber: number,
  entry: SideExitProvenanceEntry | undefined,
  draw?: DrawContext,
): boolean {
  if (!draw || !matchUp || !entry?.sourceMatchUpId || isDoubleExit(entry.previousMatchUpStatus)) return false;
  if (!matchUp.sides?.some((side) => side?.sideNumber === sideNumber && side.participantId)) return false;
  const { targetMatchUps } = positionTargets({ ...draw, matchUpId: entry.sourceMatchUpId });
  return targetMatchUps?.winnerMatchUp?.matchUpId === matchUp.matchUpId;
}

/**
 * Did `sourceMatchUpId` place a BYE this holder holds? It did when it feeds one of the holder's BYE seats across its
 * loser link: read from the draw, not from the `byeClaims` ledger the double exit used to record there (Mentat P58).
 */
function placedTheHoldersBye(matchUp: HydratedMatchUp, sourceMatchUpId: string, draw: DrawContext): boolean {
  const byeSeats = (matchUp.sides ?? []).filter((side) => side?.bye).map((side) => side?.drawPosition);
  if (!byeSeats.length) return false;
  const { loserMatchUp, loserTargetDrawPosition } =
    positionTargets({ ...draw, matchUpId: sourceMatchUpId })?.targetMatchUps ?? {};
  return loserMatchUp?.structureId === matchUp.structureId && byeSeats.includes(loserTargetDrawPosition);
}

/**
 * The exit an occupant of a BYE-held seat carries, written where they LANDED: since #5331 a carry follows its carrier
 * to their furthest round. When this request withdraws the BYE its double exit placed on the loser target, v1 brings
 * the occupant back and their exit with them (`reconcileCarriesPastByes` re-carries from the origin record), and the
 * arriving loser's exit converges with it — census 20178071 (FEED_IN_CHAMPIONSHIP 8/7, `Consolation|2|2`), where this
 * view, reading the holder alone, had planned the loser's walkover won by the occupant; and census 20057285 (P50),
 * where v1 itself lost the carry until the origin record was kept on the holder (`progressExitStatus` RULE 1).
 *
 * Since F2 (census A1, 2026-10-17) v1 also records the carry on the holder itself, beside the BYE, in every round and
 * in either entry order (`recordCarryBesideBye`), so `carriedStatuses` reads it there. A holder the carrier passed
 * before that, BYE first and outside the last round, records only the BYE it placed, and for it the carry is still read
 * where the carrier landed. One carry is one exit: an onward entry from an origin the holder already records is not
 * read twice.
 */
function carriedOnwardFromHolder(
  matchUp?: HydratedMatchUp,
  sourceMatchUpId?: string,
  draw?: DrawContext,
): MatchUpStatusUnion[] {
  if (!draw || !matchUp || !sourceMatchUpId || matchUp.matchUpStatus !== BYE) return [];
  const provenance = getSideExitProvenance({ matchUp }) ?? {};
  if (!placedTheHoldersBye(matchUp, sourceMatchUpId, draw)) return [];
  const recordedHere = new Set(
    Object.values(provenance)
      .filter((entry) => !!entry?.sourceMatchUpId && !!carriedExitStatus(entry))
      .map((entry) => entry?.sourceMatchUpId),
  );
  const statuses: MatchUpStatusUnion[] = [];
  for (const side of matchUp.sides ?? []) {
    if (!side?.participantId) continue;
    const onward = draw.inContextDrawMatchUps.filter(
      (candidate) =>
        candidate.structureId === matchUp.structureId &&
        (candidate.roundNumber ?? 0) > (matchUp.roundNumber ?? 0) &&
        candidate.sides?.some((candidateSide) => candidateSide?.participantId === side.participantId),
    );
    for (const candidate of onward) {
      const sideNumber = candidate.sides?.find((s) => s?.participantId === side.participantId)?.sideNumber;
      const entry = sideNumber ? getSideExitProvenance({ matchUp: candidate })?.[sideNumber] : undefined;
      const status = carriedExitStatus(entry);
      if (status && entry?.sourceMatchUpId !== sourceMatchUpId && !recordedHere.has(entry?.sourceMatchUpId))
        statuses.push(status);
    }
  }
  return statuses;
}

/** an exit standing on a matchUp, other than one this matchUp produced itself */
/**
 * An exit HELD beside a BYE one round back, reached through that BYE in the structure's LAST round. v1 carries an
 * arriving exit past a BYE, and in the last round, with nowhere further, records it beside the BYE
 * (`recordCarryBesideBye`, which since F2 records it beside a BYE in every round); the settle step then converges it
 * with the exit the feeding BYE matchUp holds (RULE 4).
 * So that held exit stands for the arrival to meet (census run-17 baseline, DOUBLE_ELIMINATION 8/5 seeds 20622028 and
 * 20630577, policy off: `Backdraw|2|1`'s double walkover relayed past `Backdraw|3|1`'s BYE, and the Main final's walkover
 * loser reaching `Backdraw|4|1` converged with it, where v2 had planned a walkover awarded to the BYE's seat).
 */
function heldBesideFeederBye(
  matchUp?: HydratedMatchUp,
  sourceMatchUpId?: string,
  draw?: DrawContext,
): MatchUpStatusUnion[] {
  if (!draw || !matchUp || matchUp.matchUpStatus !== BYE) return [];
  const structureMatchUps = draw.inContextDrawMatchUps.filter(
    (candidate) => candidate.structureId === matchUp.structureId,
  );
  if (structureMatchUps.some((candidate) => (candidate.roundNumber ?? 0) > (matchUp.roundNumber ?? 0))) return [];
  return (
    structureMatchUps
      // the copy carries the stored `winnerMatchUpId`, or the one the view derived on a draw storing none; a feeder
      // still without one (`hasStoredGoesTo` asks whether a structure stores ANY edge) is read from its links
      .filter(
        (feeder) =>
          feeder.matchUpStatus === BYE &&
          (feeder.winnerMatchUpId ?? winnerTargetOf(feeder.matchUpId, draw)) === matchUp.matchUpId,
      )
      .flatMap((feeder) => Object.values(getSideExitProvenance({ matchUp: feeder }) ?? {}))
      .filter((entry) => entry?.sourceMatchUpId !== sourceMatchUpId)
      .map((entry) => carriedExitStatus(entry))
      .filter((status): status is MatchUpStatusUnion => !!status)
  );
}

const winnerTargetOf = (matchUpId: string, draw: DrawContext): string | undefined =>
  positionTargets({ ...draw, matchUpId })?.targetMatchUps?.winnerMatchUp?.matchUpId;

function standingExits(matchUp?: HydratedMatchUp, sourceMatchUpId?: string, draw?: DrawContext): MatchUpStatusUnion[] {
  const carried = [
    ...carriedStatuses(matchUp, sourceMatchUpId, draw),
    ...carriedOnwardFromHolder(matchUp, sourceMatchUpId, draw),
    ...heldBesideFeederBye(matchUp, sourceMatchUpId, draw),
  ];
  if (carried.length) return carried;
  // the status is this matchUp's own product when an exit entry came from it: judged on EXIT entries
  // only, since a BYE claim on the other side is not an exit (seed 6341103: a BYE claim on side 1 and
  // this matchUp's earlier DEFAULTED on side 2 made the old every-entry test false)
  const own = Object.values(getSideExitProvenance({ matchUp }) ?? {}).some(
    (entry) => entry?.sourceMatchUpId === sourceMatchUpId && !!carriedExitStatus(entry),
  );
  return isExit(matchUp?.matchUpStatus) && !own ? [matchUp?.matchUpStatus as MatchUpStatusUnion] : [];
}

/**
 * P51 group 2 (CA, 2026-10-11): an exit decided this matchUp for the seat still awaiting its second participant, and a
 * result recorded below it would be taken back by a convergence there. The arrival carrying an exit of their own takes
 * that seat and carries the exit on from its winner matchUp, as past a BYE. Asked as v1's \`carryPastDecidedMatchUp\`
 * asks it: a single exit won by an empty side, a winner matchUp to go on to, and active downstream read as a
 * convergence reads it.
 */
function decidedForArrival({
  inContextDrawMatchUps,
  drawDefinition,
  matchUp,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  drawDefinition: DrawDefinition;
  matchUp?: HydratedMatchUp;
}): boolean {
  if (!matchUp || !isExit(matchUp.matchUpStatus) || !matchUp.winningSide) return false;
  if (matchUp.sides?.find((side) => side?.sideNumber === matchUp.winningSide)?.participantId) return false;
  const downstream = getTargetsDownstream({
    matchUpId: matchUp.matchUpId,
    inContextDrawMatchUps,
    convergence: true,
    drawDefinition,
  });
  return !downstream.error && !!downstream.activeDownstream && !!downstream.targetData?.targetMatchUps?.winnerMatchUp;
}

/** an exit carried in from this source stands on a side of the matchUp */
function carriesExitFrom(matchUp?: HydratedMatchUp, sourceMatchUpId?: string): boolean {
  return Object.values(getSideExitProvenance({ matchUp }) ?? {}).some(
    (entry) => entry?.sourceMatchUpId === sourceMatchUpId && !!carriedExitStatus(entry),
  );
}

function carriesExit(matchUp?: HydratedMatchUp, draw?: DrawContext): boolean {
  return carriedStatuses(matchUp, undefined, draw).length > 0;
}

function winnerTarget(
  winnerMatchUp?: HydratedMatchUp,
  sourceMatchUpId?: string,
  draw?: DrawContext,
): OutcomeView['targets']['winner'] {
  if (!winnerMatchUp) return undefined;
  return {
    structureId: winnerMatchUp.structureId,
    roundNumber: winnerMatchUp.roundNumber,
    roundPosition: winnerMatchUp.roundPosition,
    matchUpStatus: winnerMatchUp.matchUpStatus,
    carriesExit: carriesExit(winnerMatchUp, draw),
    carriedStatuses: standingExits(winnerMatchUp, sourceMatchUpId, draw),
    holdsResult: !!winnerMatchUp.winningSide || !!winnerMatchUp.score?.sets?.length,
    hasBye: !!winnerMatchUp.sides?.some((side) => side?.bye),
    drawPositions: (winnerMatchUp.drawPositions ?? []).filter(
      (position): position is number => typeof position === 'number',
    ),
  };
}

/**
 * THE MATCHUP A PARTICIPANT PLACED OPPOSITE A BYE GOES ON INTO (a loser fed onto the seat, or a winner into a BYE-held
 * target), as v1 sends them (`advanceIntoWinnerMatchUp`): their position joins
 * the BYE matchUp's winner matchUp in the same structure. Planned only for a clean arrival there: the next matchUp is
 * `TO_BE_PLAYED`, holds no BYE, exit, carry, provenance or result, has no earlier advance of the BYE's position to
 * replace, and does not then feed a FIRST_MATCHUP reservation. Undefined otherwise (a cascade v1 runs).
 */
function throughBye(
  byeMatchUp: HydratedMatchUp | undefined,
  drawPosition: number | undefined,
  draw: DrawContext,
): ThroughBye | undefined {
  if (!byeMatchUp || !drawPosition || byeMatchUp.matchUpStatus !== BYE) return undefined;
  const { targetMatchUps, targetLinks } = positionTargets({ ...draw, matchUpId: byeMatchUp.matchUpId }) ?? {};
  const next = targetMatchUps?.winnerMatchUp;
  if (!next || targetLinks?.winnerTargetLink || next.structureId !== byeMatchUp.structureId) return undefined;
  const target = winnerTarget(next, byeMatchUp.matchUpId, draw);
  if (
    !target ||
    target.matchUpStatus !== TO_BE_PLAYED ||
    target.hasBye ||
    target.carriesExit ||
    target.carriedStatuses.length ||
    target.holdsResult ||
    Object.keys(next.sideExitProvenance ?? {}).length
  )
    return undefined;
  // the loser's own position may stand there already, advanced structurally while their seat was empty: they occupy
  // it, and v1 announces the matchUp. The BYE's position standing there is an earlier advance v1 replaces: not planned
  const byePositions = (byeMatchUp.drawPositions ?? []).filter((position) => position && position !== drawPosition);
  if (target.drawPositions.some((position) => byePositions.includes(position))) return undefined;
  const drawPositions = [...new Set([...target.drawPositions, drawPosition])].sort((a, b) => a - b);
  if (drawPositions.length > 2) return undefined;
  if (drawPositions.length === 2) {
    const onward = positionTargets({ ...draw, matchUpId: next.matchUpId })?.targetLinks?.loserTargetLink;
    if (onward?.linkCondition === FIRST_MATCHUP) return undefined;
  }
  return { matchUpId: next.matchUpId, drawPositions };
}

/** the drawPosition a side of the matchUp holds */
function sideDrawPosition(matchUp: HydratedMatchUp | undefined, sideNumber: 1 | 2): number | undefined {
  return matchUp?.sides?.find((side) => side.sideNumber === sideNumber)?.drawPosition;
}

/**
 * A swap's relabel in its own structure, as v1's `swapWinnerLoser` finds it: the later-round matchUps holding the old
 * winner's position or the old loser's, from the stored map. Only built for a call that may swap (a winner changing with
 * `allowChangePropagation`).
 */
function swapPath({
  inContextDrawMatchUps,
  inContextMatchUp,
  loserTargetLink,
  drawDefinition,
  matchUpsMap,
  structure,
  matchUp,
  request,
  event,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  inContextMatchUp?: HydratedMatchUp;
  loserTargetLink?: DrawLink;
  drawDefinition: DrawDefinition;
  matchUpsMap: MatchUpsMap;
  structure?: Structure;
  request: OutcomeRequest;
  matchUp: MatchUp;
  event?: Event;
}): OutcomeView['targets']['swap'] {
  const winningSide = matchUp.winningSide;
  if (!request.flags.allowChangePropagation || !request.winningSide || !winningSide) return undefined;
  if (request.winningSide === winningSide || !inContextMatchUp?.structureId) return undefined;
  const positionA = sideDrawPosition(inContextMatchUp, winningSide as 1 | 2);
  const positionB = sideDrawPosition(inContextMatchUp, (3 - winningSide) as 1 | 2);
  if (!positionA) return undefined;
  const structureId = inContextMatchUp.structureId;
  const roundNumber = inContextMatchUp.roundNumber ?? 0;
  const path = (matchUpsMap.mappedMatchUps[structureId]?.matchUps ?? []).filter(
    (candidate) =>
      (candidate.roundNumber ?? 0) > roundNumber &&
      (candidate.drawPositions?.includes(positionA) || (!!positionB && candidate.drawPositions?.includes(positionB))),
  );
  return {
    relabels: swapRelabels({
      settled: () =>
        !!structure &&
        swapFeedsSettled({
          inContextDrawMatchUps,
          inContextMatchUp,
          loserTargetLink,
          drawDefinition,
          positionA,
          positionB,
          structure,
          matchUp,
          request,
          event,
        }),
      winningSide: winningSide as 1 | 2,
      inContextMatchUp,
      drawDefinition,
      structureId,
    }),
    positionA,
    positionB,
    pathMatchUpIds: path.map(({ matchUpId }) => matchUpId),
    pathCarriesExit: path.some(
      (candidate) =>
        isAnyExit(candidate.matchUpStatus) || Object.values(candidate.sideExitProvenance ?? {}).some(Boolean),
    ),
    linkedOut: (drawDefinition.links ?? []).some((link) => link.source?.structureId === structureId),
  };
}

/**
 * Whether a swap the call asks for meets an active fed seat across a FIRST_MATCHUP link: v1's two refusals, asked in
 * v1's order before `swapWinnerLoser` writes anything, read on the view's own base (no hydration). Only asked for a call
 * that may swap; both return at once unless a FIRST_MATCHUP feed is in reach.
 */
function swapMeetsActivePosition({
  inContextDrawMatchUps,
  inContextMatchUp,
  loserTargetLink,
  drawDefinition,
  loserMatchUp,
  structure,
  matchUp,
  request,
  event,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  inContextMatchUp?: HydratedMatchUp;
  drawDefinition: DrawDefinition;
  loserTargetLink?: DrawLink;
  loserMatchUp?: MatchUp;
  structure?: Structure;
  request: OutcomeRequest;
  matchUp: MatchUp;
  event?: Event;
}): boolean {
  const winningSide = matchUp.winningSide;
  if (!request.flags.allowChangePropagation || !request.winningSide || !winningSide || !structure) return false;
  if (request.winningSide === winningSide || !inContextMatchUp) return false;
  const existingWinnerDrawPosition = sideDrawPosition(inContextMatchUp, winningSide as 1 | 2);
  const existingLoserDrawPosition = sideDrawPosition(inContextMatchUp, (3 - winningSide) as 1 | 2);
  const flippedRoundNumber = inContextMatchUp.roundNumber;
  const placement = fedLoserPlacementRefusal({
    loserTargetLink,
    loserMatchUp,
    prospectiveLoserDrawPosition: existingWinnerDrawPosition as number,
    departingLoserDrawPosition: existingLoserDrawPosition as number,
    inContextDrawMatchUps,
    flippedRoundNumber,
    drawDefinition,
    structure,
    event,
  });
  if (placement?.error) return true;
  const pathFeed = relabelledPathFeedRefusal({
    matchUpStatus: request.matchUpStatus,
    existingWinnerDrawPosition,
    existingLoserDrawPosition,
    inContextDrawMatchUps,
    score: request.score as Score | undefined,
    flippedRoundNumber,
    fromIndex: true,
    drawDefinition,
    structure,
    matchUp,
    event,
  });
  return !!pathFeed?.error;
}

/**
 * Whether a swap's `FIRST_MATCHUP` reconciliations write nothing, so the relabel is v1's whole write for them: the
 * flipped matchUp's own feed (`reconcileFedLoserEligibility`: the new loser is eligible exactly when the old one held the
 * fed seat the relabel hands over) and every later loss on the path (`relabelledPathFeedChanges` empty). Read on the
 * view's own base.
 */
function swapFeedsSettled({
  inContextDrawMatchUps,
  inContextMatchUp,
  loserTargetLink,
  drawDefinition,
  positionA,
  positionB,
  structure,
  matchUp,
  request,
  event,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  inContextMatchUp: HydratedMatchUp;
  loserTargetLink?: DrawLink;
  drawDefinition: DrawDefinition;
  positionA: number;
  positionB?: number;
  structure: Structure;
  request: OutcomeRequest;
  matchUp: MatchUp;
  event?: Event;
}): boolean {
  const flippedRoundNumber = inContextMatchUp.roundNumber ?? 0;
  if (loserTargetLink?.linkCondition === FIRST_MATCHUP) {
    const before = teamLevelMatchUps(
      inContextDrawMatchUps.filter(
        (candidate) =>
          candidate.structureId === structure.structureId && (candidate.roundNumber ?? 0) < flippedRoundNumber,
      ),
    );
    const eligibleNew = getDrawPositionWinCount({ sourceMatchUps: before, drawPosition: positionA }) === 0;
    const oldLoserId = inContextMatchUp.sides?.find((side) => side.drawPosition === positionB)?.participantId;
    const { structure: target } = findStructure({ drawDefinition, structureId: loserTargetLink.target?.structureId });
    const oldLoserSeated = !!oldLoserId && !!positionAssignmentsOf(target)?.some((a) => a.participantId === oldLoserId);
    if (eligibleNew !== oldLoserSeated) return false;
  }
  const changes = relabelledPathFeedChanges({
    existingWinnerDrawPosition: positionA,
    existingLoserDrawPosition: positionB,
    matchUpStatus: request.matchUpStatus,
    score: request.score as Score | undefined,
    inContextDrawMatchUps,
    flippedRoundNumber,
    fromIndex: true,
    drawDefinition,
    structure,
    matchUp,
    event,
  });
  return !changes.length;
}

/**
 * The structures downstream of a matchUp, as v1's `getDownstreamStructureIds` walks them: the targets of its structure's
 * links from its round on, then every link out of each structure reached; the source structure itself is never one. The
 * links walked are returned too, so their conditions can be asked.
 */
function downstreamOf(drawDefinition: DrawDefinition, structureId: string, roundNumber: number) {
  const links = drawDefinition.links ?? [];
  const reached = new Set<string>();
  const walked = links.filter(
    (link) => link.source?.structureId === structureId && (link.source?.roundNumber ?? 0) >= roundNumber,
  );
  const queue = walked.map((link) => link.target?.structureId);
  while (queue.length) {
    const next = queue.shift();
    if (!next || next === structureId || reached.has(next)) continue;
    reached.add(next);
    for (const link of links)
      if (link.source?.structureId === next) {
        walked.push(link);
        queue.push(link.target?.structureId);
      }
  }
  return { reached, walked };
}

/**
 * A swap's relabel downstream, as v1's `swapWinnerLoser` makes it: in each structure downstream of the matchUp, the seat
 * the old winner holds takes the old loser and the reverse, each guarded on the id it writes; a structure upstream (a
 * consolation's Main) is not touched. Undefined, so the swap is v1's, where a walked link carries a condition (a
 * FIRST_MATCHUP feed v1 reconciles after the flip) or a loser link feeds this structure FROM a downstream one (an origin,
 * whose re-entries v1 exchanges by origin positions). A WINNER link back into this structure (DOUBLE_ELIMINATION's
 * Backdraw champion into the Main final) re-enters on the participant's own position here, which the path exchange covers.
 */
function swapRelabels({
  inContextMatchUp,
  drawDefinition,
  structureId,
  winningSide,
  settled,
}: {
  inContextMatchUp: HydratedMatchUp;
  drawDefinition: DrawDefinition;
  structureId: string;
  winningSide: 1 | 2;
  /** no FIRST_MATCHUP feed of the source structure changes eligibility (`swapFeedsSettled`), asked only when one is walked */
  settled: () => boolean;
}): { structureId: string; drawPosition: number; participantId: string }[] | undefined {
  const { reached, walked } = downstreamOf(drawDefinition, structureId, inContextMatchUp.roundNumber ?? 0);
  const conditioned = walked.filter((link) => link.linkCondition);
  // v1 reconciles the source structure's own FIRST_MATCHUP feeds after the flip; a condition anywhere else is v1's
  if (conditioned.some((link) => link.source?.structureId !== structureId || link.linkCondition !== FIRST_MATCHUP))
    return undefined;
  if (conditioned.length && !settled()) return undefined;
  const origin = (drawDefinition.links ?? []).some(
    (link) =>
      link.linkType === LOSER && link.target?.structureId === structureId && reached.has(link.source?.structureId),
  );
  if (origin) return undefined;
  const winnerId = inContextMatchUp.sides?.find((side) => side.sideNumber === winningSide)?.participantId;
  const loserId = inContextMatchUp.sides?.find((side) => side.sideNumber === 3 - winningSide)?.participantId;
  const relabels: { structureId: string; drawPosition: number; participantId: string }[] = [];
  for (const structure of drawDefinition.structures ?? []) {
    if (!reached.has(structure.structureId)) continue;
    for (const assignment of positionAssignmentsOf(structure) ?? []) {
      const held = assignment.participantId;
      if (!held || (held !== winnerId && held !== loserId)) continue;
      const participantId = held === winnerId ? loserId : winnerId;
      if (participantId)
        relabels.push({ structureId: structure.structureId, drawPosition: assignment.drawPosition, participantId });
    }
  }
  return relabels;
}

/** a stored matchUp's status codes and whether it holds exit provenance, as the write that re-derives them reads them */
function storedSideRecord(matchUpsMap: MatchUpsMap, matchUpId?: string): OutcomeView['targets']['loserMatchUpRecord'] {
  const stored = matchUpId ? matchUpsMap.drawMatchUps.find((m) => m.matchUpId === matchUpId) : undefined;
  if (!stored) return undefined;
  return {
    matchUpStatusCodes: stored.matchUpStatusCodes,
    provenance: Object.values(stored.sideExitProvenance ?? {}).some(Boolean),
  };
}

/** the stored assignment a loser link feeds: free (no participant, no BYE), or what holds it */
function loserTargetSeat(
  drawDefinition: DrawDefinition,
  structureId?: string,
  drawPosition?: number,
  matchUpDrawPositions: (number | undefined)[] = [],
): OutcomeView['targets']['loserTargetSeat'] {
  if (!structureId || !drawPosition) return undefined;
  const { structure } = findStructure({ drawDefinition, structureId });
  const assignments = positionAssignmentsOf(structure) ?? [];
  const assignment = assignments.find((a) => a.drawPosition === drawPosition);
  if (!assignment) return undefined;
  const opponents = matchUpDrawPositions.filter((position) => position && position !== drawPosition);
  return {
    free: !assignment.participantId && !assignment.bye && !assignment.qualifier,
    opponentBye: assignments.some((a) => a.bye && opponents.includes(a.drawPosition)),
    bye: !!assignment.bye,
    opponentHeld: assignments.some((a) => (a.participantId || a.bye) && opponents.includes(a.drawPosition)),
    participantId: assignment.participantId,
  };
}

/** this matchUp's round and position, and how many matchUps its round and the next hold in its structure */
function sourcePlace(inContextDrawMatchUps: HydratedMatchUp[], inContextMatchUp?: HydratedMatchUp) {
  const inStructure = inContextDrawMatchUps.filter(
    (m) => m.structureId === inContextMatchUp?.structureId && !m.collectionId,
  );
  const round = inContextMatchUp?.roundNumber;
  return {
    structureId: inContextMatchUp?.structureId,
    roundNumber: round,
    roundPosition: inContextMatchUp?.roundPosition,
    roundMatchUpCount: round ? inStructure.filter((m) => m.roundNumber === round).length : 0,
    nextRoundMatchUpCount: round ? inStructure.filter((m) => m.roundNumber === round + 1).length : 0,
  };
}

/** the losses each side's participant holds across the draw, this matchUp and `excludeMatchUpId` left out */
function priorLosses(
  inContextDrawMatchUps: HydratedMatchUp[],
  inContextMatchUp?: HydratedMatchUp,
  excludeMatchUpId?: string,
): { 1: number; 2: number } {
  const losses = (sideNumber: number) => {
    const participantId = inContextMatchUp?.sides?.find((side) => side.sideNumber === sideNumber)?.participantId;
    if (!participantId) return 0;
    return inContextDrawMatchUps.filter(
      (m) =>
        m.matchUpId !== inContextMatchUp?.matchUpId &&
        m.matchUpId !== excludeMatchUpId &&
        !m.collectionId &&
        !!m.winningSide &&
        (m.sides ?? []).some((side) => side.participantId === participantId && side.sideNumber !== m.winningSide),
    ).length;
  };
  return { 1: losses(1), 2: losses(2) };
}

/** the wins each side's drawPosition holds in this matchUp's structure, the matchUp itself left out */
function priorWins(
  inContextDrawMatchUps: HydratedMatchUp[],
  inContextMatchUp?: HydratedMatchUp,
  beforeThisRound = false,
): { 1: number; 2: number } {
  const sourceMatchUps = teamLevelMatchUps(inContextDrawMatchUps).filter(
    (m) =>
      m.structureId === inContextMatchUp?.structureId &&
      m.matchUpId !== inContextMatchUp?.matchUpId &&
      (!beforeThisRound || (m.roundNumber ?? 0) < (inContextMatchUp?.roundNumber ?? 0)),
  );
  const wins = (sideNumber: number) => {
    const drawPosition = inContextMatchUp?.sides?.find((side) => side.sideNumber === sideNumber)?.drawPosition;
    return drawPosition ? getDrawPositionWinCount({ sourceMatchUps, drawPosition }) : 0;
  };
  return { 1: wins(1), 2: wins(2) };
}

/** a lucky draw's round with an odd number of matchUps feeds nobody forward (`checkIsPreFeedRound`) */
/** a result of its own: what a relabel's carry may not overwrite (CA, 2026-10-02) */
function hasResult(matchUp?: HydratedMatchUp): boolean {
  if (!matchUp) return false;
  return (
    !!checkScoreHasValue({ score: matchUp.score }) ||
    !!matchUp.winningSide ||
    matchUp.matchUpStatus === COMPLETED ||
    isAnyExit(matchUp.matchUpStatus)
  );
}

function luckyPreFeed(drawDefinition: DrawDefinition, matchUp: MatchUp, structure?: Structure): boolean {
  const structureMatchUps = matchUpsOf(structure);
  if (!isLuckyBasedDraw(drawDefinition?.drawType) || !matchUp.roundNumber || !structureMatchUps) return false;
  return structureMatchUps.filter((m) => m.roundNumber === matchUp.roundNumber).length % 2 !== 0;
}

// a TEAM line's format is its collection's, which only the hydrated matchUp carries — see `resolveScoringFormat`
function resolveFormat(
  request: OutcomeRequest,
  matchUp: MatchUp,
  structure: Structure | undefined,
  drawDefinition: DrawDefinition,
  event: Event | undefined,
  inContextMatchUp?: HydratedMatchUp,
): string | undefined {
  return resolveScoringFormat({
    incoming: request.matchUpFormat,
    inContextMatchUp,
    drawDefinition,
    structure,
    matchUp,
    event,
  });
}

/**
 * § 2 row 4, as v1's `checkMatchUpFormatApplication` decides it (#5608, scoring engine spec § 16 decision 19, CA
 * 2026-10-18): a format that is not well-formed is refused; one well-formed but refused for NEW use is refused only
 * when it would change the format the matchUp plays under. A score sent back with the stored format is not a new use.
 */
function formatRecognizedFor(incoming: string | undefined, stored: string | undefined): boolean {
  if (!incoming) return true;
  if (!isWellFormedMatchUpFormat({ matchUpFormat: incoming })) return false;
  return incoming === stored || isValidMatchUpFormat({ matchUpFormat: incoming });
}

/** the format the matchUp plays under, by v1's chain: matchUp, structure, draw, event */
function appliedFormat(
  matchUp: MatchUp,
  structure: Structure | undefined,
  drawDefinition: DrawDefinition,
  event: Event | undefined,
): string | undefined {
  return matchUp.matchUpFormat ?? structure?.matchUpFormat ?? drawDefinition.matchUpFormat ?? event?.matchUpFormat;
}

/**
 * THE DRAW THE VIEW DECIDES ON (§ 3.1.1, CA 2026-10-24): the structural index, never a hydration. A draw the index does
 * not cover yet (TEAM) is hydrated as before; another view of the same draw in the same call reuses the first's.
 */
function drawToDecideOn(
  { tournamentRecord, drawDefinition, event, ...args }: BuildViewArgs & { drawDefinition: DrawDefinition },
  matchUpsMap: MatchUpsMap,
): { inContextDrawMatchUps?: HydratedMatchUp[]; structural: boolean } {
  if (args.inContextDrawMatchUps)
    return { inContextDrawMatchUps: args.inContextDrawMatchUps, structural: !!args.structural };
  const index = buildStructuralIndex({ tournamentRecord, drawDefinition, event });
  if (!index.unsupported) return { inContextDrawMatchUps: index.matchUps, structural: true };
  const hydrated = getAllDrawMatchUps({ tournamentRecord, inContext: true, drawDefinition, matchUpsMap, event });
  return { inContextDrawMatchUps: hydrated.matchUps, structural: false };
}

/**
 * THE FIRST_MATCHUP RESERVATION a winner's arrival makes, as v1's `propagateConsolationBye` decides it once the winner is
 * placed: the winner's target, holding two drawPositions with the arrival, no BYE among them and no result, whose loser
 * link is FIRST_MATCHUP and whose first-round feeders all hold a scored win (this call's result among them, when it is a
 * scored win), reserves its loser's seat with a BYE. A seat already a BYE needs nothing; a
 * seat holding somebody, a consolation matchUp whose other seat is held (the BYE would advance them) or that holds
 * provenance, and a stale reservation to withdraw, are not planned: `abstain`. Undefined on a draw with no such link.
 */
function firstMatchReservations({
  positionBySide,
  sourceMatchUpId,
  winnerMatchUp,
  sourceScored,
  matchUpsMap,
  draw,
}: {
  positionBySide: { 1?: number; 2?: number };
  winnerMatchUp?: HydratedMatchUp;
  sourceMatchUpId: string;
  sourceScored: boolean;
  matchUpsMap: MatchUpsMap;
  draw: DrawContext;
}): OutcomeView['targets']['reservations'] {
  const { drawDefinition, inContextDrawMatchUps } = draw;
  if (!(drawDefinition.links ?? []).some((link) => link.linkCondition === FIRST_MATCHUP)) return undefined;
  const none: Reservation = { kind: 'none' };
  if (!winnerMatchUp || winnerMatchUp.winningSide) return { 1: none, 2: none };
  const targetData = positionTargets({ matchUpId: winnerMatchUp.matchUpId, inContextDrawMatchUps, drawDefinition });
  const { loserMatchUp, loserTargetDrawPosition } = targetData?.targetMatchUps ?? {};
  const loserLink = targetData?.targetLinks?.loserTargetLink;
  if (loserLink?.linkCondition !== FIRST_MATCHUP || !loserMatchUp || loserTargetDrawPosition === undefined)
    return { 1: none, 2: none };
  const { structure } = findStructure({ drawDefinition, structureId: winnerMatchUp.structureId });
  const sourceAssignments = positionAssignmentsOf(structure) ?? [];
  const loserAssignments =
    getPositionAssignments({ drawDefinition, structureId: loserMatchUp.structureId }).positionAssignments ?? [];
  const seat = loserAssignments.find((assignment) => assignment.drawPosition === loserTargetDrawPosition);
  const otherHeld = (loserMatchUp.drawPositions ?? [])
    .filter((position) => position && position !== loserTargetDrawPosition)
    .some((position) => {
      const assignment = loserAssignments.find((candidate) => candidate.drawPosition === position);
      return !!assignment?.participantId || !!assignment?.bye;
    });
  const holdsProvenance = !!Object.keys(loserMatchUp.sideExitProvenance ?? {}).length;
  const structureMatchUps: MatchUp[] = getMappedStructureMatchUps({
    matchUpsMap,
    structureId: winnerMatchUp.structureId,
  });
  const firstRound = structureMatchUps.filter((matchUp) => matchUp.roundNumber === 1);

  const forSide = (sideNumber: 1 | 2): Reservation => {
    const updated = [
      ...new Set([...(winnerMatchUp.drawPositions ?? []), positionBySide[sideNumber]].filter(Boolean)),
    ] as number[];
    if (updated.length !== 2) return none;
    if (sourceAssignments.some((assignment) => assignment.bye && updated.includes(assignment.drawPosition)))
      return none;
    const won = firstRound
      .filter((feeder) => overlap(feeder.drawPositions ?? [], updated))
      .every(
        (feeder) =>
          (feeder.matchUpId === sourceMatchUpId && sourceScored) ||
          (!!feeder.winningSide && !isUnscoredOutcome({ matchUpStatus: feeder.matchUpStatus, score: feeder.score })),
      );
    if (!won) return seat?.bye && seat.byeFromPropagation ? { kind: 'abstain' } : none;
    if (seat?.bye) return none;
    if (seat?.participantId || otherHeld || holdsProvenance) return { kind: 'abstain' };
    return {
      kind: 'reserve',
      structureId: loserMatchUp.structureId,
      drawPosition: loserTargetDrawPosition,
      matchUpId: loserMatchUp.matchUpId,
      drawPositions: (loserMatchUp.drawPositions ?? []).filter(Boolean) as number[],
    };
  };
  return { 1: forSide(1), 2: forSide(2) };
}

/**
 * AN AD HOC STRUCTURE'S TALLY, as v1's `updateTallyIfNeeded` takes it: every matchUp of the structure, under the call's format,
 * the matchUp's, the structure's, the draw's or the event's, and assignments rebuilt as one per participant the matchUps
 * hold, in the order they appear. A dual or a line is not tallied here.
 */
function adHocGroup({
  inContextDrawMatchUps,
  inContextMatchUp,
  drawDefinition,
  matchUp,
  args,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  inContextMatchUp?: HydratedMatchUp;
  drawDefinition: DrawDefinition;
  args: BuildViewArgs;
  matchUp: MatchUp;
}): OutcomeView['group'] {
  const structureId = inContextMatchUp?.structureId;
  if (!structureId || matchUp.collectionId || matchUp.tieMatchUps) return undefined;
  const { structure } = findStructure({ drawDefinition, structureId });
  if (!structure || !isAdHoc({ structure })) return undefined;
  const { tournamentRecord, event, request } = args;
  const { policyDefinitions } = getPolicyDefinitions({
    policyTypes: [POLICY_TYPE_ROUND_ROBIN_TALLY],
    tournamentRecord,
    drawDefinition,
    event,
  });
  // in the structure's stored order, as v1 reads them (`getAllStructureMatchUps`). One round only: across rounds (a
  // Swiss), v1 rebuilds the assignments from round 2's pairings alone (measured, `swissIntegration`), which is not
  // modelled here, so a multi-round structure's tally stays v1's
  const byId = new Map(inContextDrawMatchUps.map((candidate) => [candidate.matchUpId, candidate]));
  const matchUps = (matchUpsOf(structure) ?? [])
    .map((stored) => byId.get(stored.matchUpId))
    .filter((candidate): candidate is HydratedMatchUp => !!candidate);
  if (new Set(matchUps.map((candidate) => candidate.roundNumber)).size > 1) return undefined;
  const participantIds = [
    ...new Set(matchUps.flatMap((candidate) => (candidate.sides ?? []).map((side) => side.participantId))),
  ].filter((participantId): participantId is string => !!participantId);
  return {
    containerStructureId: structureId,
    structureId,
    matchUps,
    positionAssignments: participantIds.map((participantId) => ({ participantId }) as PositionAssignment),
    matchUpFormat:
      request.matchUpFormat ??
      matchUp.matchUpFormat ??
      structure.matchUpFormat ??
      drawDefinition.matchUpFormat ??
      event?.matchUpFormat,
    policyDefinitions,
    adHoc: true,
  };
}

/**
 * A round robin group's tally inputs, as v1's `updateTallyIfNeeded` reads them (`modifyMatchUpScore.ts`): the group's
 * matchUps (the index's entries; the planner substitutes the call's own result), its position assignments, the format
 * v1 resolves (the call's, the matchUp's own, the container's, the draw's, the event's) and the round robin tally policy
 * v1 reads with no call-level policy. A TEAM dual's tally (S7) and a line of one are not asked.
 */
function roundRobinGroup({
  inContextDrawMatchUps,
  inContextMatchUp,
  drawDefinition,
  matchUp,
  args,
}: {
  inContextDrawMatchUps: HydratedMatchUp[];
  inContextMatchUp?: HydratedMatchUp;
  drawDefinition: DrawDefinition;
  args: BuildViewArgs;
  matchUp: MatchUp;
}): OutcomeView['group'] {
  const containerStructureId = inContextMatchUp?.containerStructureId;
  const structureId = inContextMatchUp?.structureId;
  if (!containerStructureId || !structureId || matchUp.collectionId || matchUp.tieMatchUps) return undefined;
  const { structure: container } = findStructure({ drawDefinition, structureId: containerStructureId });
  const group = structuresOf(container)?.find((child) => child.structureId === structureId);
  if (!group) return undefined;
  const { tournamentRecord, event, request } = args;
  const { policyDefinitions } = getPolicyDefinitions({
    policyTypes: [POLICY_TYPE_ROUND_ROBIN_TALLY],
    tournamentRecord,
    drawDefinition,
    event,
  });
  return {
    containerStructureId,
    structureId,
    matchUps: inContextDrawMatchUps.filter((candidate) => candidate.structureId === structureId),
    positionAssignments: positionAssignmentsOf(group) ?? [],
    matchUpFormat:
      request.matchUpFormat ??
      matchUp.matchUpFormat ??
      container?.matchUpFormat ??
      drawDefinition.matchUpFormat ??
      event?.matchUpFormat,
    policyDefinitions,
  };
}

export function buildOutcomeView(args: BuildViewArgs): OutcomeView {
  const { tournamentRecord, drawDefinition, event, request, policyDefinitions } = args;
  const empty: OutcomeView = {
    hasDrawDefinition: !!drawDefinition,
    // before the matchUp is found only well-formedness is asked: v1 refuses a matchUp not found before a new use
    formatRecognized: !request.matchUpFormat || isWellFormedMatchUpFormat({ matchUpFormat: request.matchUpFormat }),
    drawType: drawDefinition?.drawType,
    found: false,
    isTeam: false,
    existing: {
      validWinningScore: false,
      scoreHasValue: false,
      scoredTime: false,
      carriedExit: false,
      hasSideExitProvenance: false,
    },
    propagatedExitStands: false,
    activeDownstream: false,
    participants: { required: false, count: 0, exitAwardable: false, requireForScoring: true },
    draw: {
      isAdHoc: false,
      teamRoundRobin: false,
      includesBye: false,
      timedTie: false,
      tallied: false,
      storesEdges: true,
    },
    targets: {
      luckyPreFeed: false,
      sideParticipantIds: {},
      sideDrawPositions: {},
      priorWins: { 1: 0, 2: 0 },
      priorWinsBefore: { 1: 0, 2: 0 },
      priorLosses: { 1: 0, 2: 0 },
      loserMatchUpHasResult: false,
      loserMatchUpCarriesExit: false,
      loserMatchUpCarriedStatuses: [],
      loserMatchUpCarriesSourceExit: false,
      loserMatchUpDecidedForArrival: false,
      source: { roundMatchUpCount: 0, nextRoundMatchUpCount: 0 },
    },
  };
  if (!drawDefinition || !request.matchUpId) return empty;

  const matchUpsMap = args.matchUpsMap ?? getMatchUpsMap({ drawDefinition });
  const { inContextDrawMatchUps, structural } = drawToDecideOn({ ...args, drawDefinition }, matchUpsMap);
  const matchUp = matchUpsMap.drawMatchUps.find((m) => m.matchUpId === request.matchUpId);
  const inContextMatchUp = inContextDrawMatchUps?.find((m) => m.matchUpId === request.matchUpId);
  if (!matchUp || !inContextDrawMatchUps) return empty;
  // A DRAW STORED WITHOUT ITS EDGES: v1 writes them before it decides anything (`ensureGoesTo`, onto its view too),
  // and its guards read `winnerMatchUpId` on that view (`relabelLoserExit`). The view takes the same edges onto its own
  // copy and writes nothing. A draw the factory generated stores them, and pays only the `hasStoredGoesTo` walk.
  // `hasPropagatedExitDownstream` (§ 2 row 10) reads `loserMatchUpId` off the STORED matchUps, so on such a draw it is
  // handed an overlay of the stored map carrying the derived edges (review of #5741); the stored objects are not touched.
  const goesTo = hasStoredGoesTo({ drawDefinition })
    ? undefined
    : addGoesTo({ inContextDrawMatchUps, drawDefinition, matchUpsMap, inContextOnly: true }).goesToMap;
  const storedView = goesTo
    ? {
        ...matchUpsMap,
        drawMatchUps: matchUpsMap.drawMatchUps.map((stored) => ({
          ...stored,
          winnerMatchUpId: stored.winnerMatchUpId ?? goesTo.winnerMatchUpIds[stored.matchUpId],
          loserMatchUpId: stored.loserMatchUpId ?? goesTo.loserMatchUpIds[stored.matchUpId],
        })),
      }
    : matchUpsMap;
  const draw: DrawContext = { inContextDrawMatchUps, drawDefinition };

  const { structure } = findStructure({ drawDefinition, structureId: inContextMatchUp?.structureId });
  const isTeam = isMatchUpEventType(TEAM)(matchUp.matchUpType);
  const matchUpTieId = inContextMatchUp?.matchUpTieId;
  // the STORED result is judged under the STORED format; what the call would decide, under the
  // format the call would apply (row 9's second and third conditions resolve differently)
  const storedFormat = resolveFormat(
    { flags: request.flags },
    matchUp,
    structure,
    drawDefinition,
    event,
    inContextMatchUp,
  );
  const incomingFormat = resolveFormat(request, matchUp, structure, drawDefinition, event, inContextMatchUp);

  const validWinningScore =
    matchUp.matchUpStatus === COMPLETED &&
    !!matchUp.winningSide &&
    !!analyzeMatchUp({ matchUp, matchUpFormat: storedFormat }).validMatchUpOutcome;
  const impliedWinningSide =
    request.score && incomingFormat
      ? analyzeMatchUp({
          matchUp: { score: request.score, matchUpFormat: incomingFormat },
          matchUpFormat: incomingFormat,
        }).calculatedWinningSide
      : undefined;

  // a malformed round link, the matchUp's own or downstream, is an error in v1 (CA, 2026-10-06): § 2 row 21
  const targets = getTargetsDownstream({
    matchUpId: matchUpTieId || request.matchUpId,
    inContextDrawMatchUps,
    drawDefinition,
  });
  const targetData = targets.targetData;
  const drawView = {
    inContextDrawMatchUps,
    inContextMatchUp,
    matchUpTieId,
    matchUpsMap: storedView,
    targetData,
    structure,
    matchUp,
    drawDefinition,
  };
  // and a malformed link anywhere in the draw, which the cascade could otherwise meet only after it had written
  const malformed = targets.error ? targets : getMalformedRoundLink(drawDefinition);
  const unreadableLink = malformed?.error
    ? { error: malformed.error, info: malformed.info, context: malformed.context }
    : undefined;
  const propagatedExitStands = !unreadableLink && !!hasPropagatedExitDownstream(drawView);
  const activeDownstream = !!targets.activeDownstream;

  const appliedPolicies =
    getAppliedPolicies({
      policyTypes: [POLICY_TYPE_PROGRESSION, POLICY_TYPE_SCORING],
      tournamentRecord,
      drawDefinition,
      event,
    })?.appliedPolicies ?? {};
  if (isObject(policyDefinitions)) Object.assign(appliedPolicies, policyDefinitions);
  const requireForScoring = appliedPolicies?.[POLICY_TYPE_SCORING]?.requireParticipantsForScoring !== false;

  const assignedDrawPositions = inContextMatchUp?.drawPositions?.filter(Boolean);
  const count = inContextMatchUp?.sides?.map((side) => side.participantId).filter(Boolean).length ?? 0;
  const allAssignments =
    getPositionAssignments({ structureId: structure?.structureId, drawDefinition }).positionAssignments ?? [];
  const positionAssignments = matchUp.sides ? [] : allAssignments;
  const required =
    count === 2 ||
    (!!matchUp.collectionId && isAdHoc({ structure }) && count >= 1) ||
    (assignedDrawPositions?.length === 2 &&
      positionAssignments
        .filter((assignment) => assignedDrawPositions.includes(assignment.drawPosition))
        .every((assignment) => assignment.participantId));

  const feed = feedEligibilityChange({
    inContextDrawMatchUps,
    drawDefinition,
    matchUpStatus: request.matchUpStatus,
    winningSide: request.winningSide,
    structure,
    matchUp,
    score: request.score,
  });

  // the same predicate v1 asks: one rule, read by both pipelines (P52)
  const kind = request.flags.propagatingExit
    ? undefined
    : correctionKindChange({
        propagateRetirementAsExit: request.flags.propagateRetirementAsExit,
        propagateExitStatus: request.flags.propagateExitStatus,
        loserTargetLink: targetData?.targetLinks?.loserTargetLink,
        matchUpStatus: request.matchUpStatus,
        winningSide: request.winningSide,
        inContextDrawMatchUps,
        inContextMatchUp,
        drawDefinition,
        matchUp,
      });

  let line: OutcomeView['line'];
  if (matchUpTieId) {
    const { matchUp: dualMatchUp } = findDrawMatchUp({
      matchUpId: matchUpTieId,
      inContext: true,
      drawDefinition,
      matchUpsMap,
      event,
    });
    if (dualMatchUp) {
      const tieFormat = resolveTieFormat({ matchUp: dualMatchUp, drawDefinition, structure, event })?.tieFormat;
      const { projectedWinningSide } = getProjectedDualWinningSide({
        matchUpStatus: request.matchUpStatus,
        winningSide: request.winningSide,
        score: request.score,
        drawDefinition,
        dualMatchUp,
        matchUpsMap,
        tieFormat,
        structure,
        matchUp,
        event,
      });
      line = {
        dualMatchUpId: matchUpTieId,
        dualMatchUpStatus: dualMatchUp.matchUpStatus,
        dualWinningSide: dualMatchUp.winningSide,
        projectedWinningSide,
        autoCalcDisabled: !!(dualMatchUp.disableAutoCalc ?? dualMatchUp._disableAutoCalc),
      };
    }
  }

  let dualProjection: OutcomeView['dualProjection'];
  if (isTeam && request.flags.enableAutoCalc) {
    // v1 hands the generator the raw matchUp; the same input keeps the projection identical
    const { winningSide, scoreStringSide1, scoreStringSide2, set } = generateTieMatchUpScore({
      matchUp: matchUp as HydratedMatchUp,
      drawDefinition,
      matchUpsMap,
      structure,
      event,
    });
    dualProjection = {
      projectedWinningSide: winningSide,
      // the score v1 writes in place of the call's: `handleTeamAutoCalc` builds it from the same projection
      score: { scoreStringSide1, scoreStringSide2, sets: set ? [set] : [] },
    };
  }

  return {
    ...empty,
    inContextDrawMatchUps,
    structural,
    formatRecognized: formatRecognizedFor(
      request.matchUpFormat,
      appliedFormat(matchUp, structure, drawDefinition, event),
    ),
    found: true,
    isTeam,
    matchUpTieId,
    isDeciderMatchUp: isDeciderStructure({ drawDefinition, structureId: structure?.structureId }),
    existing: {
      matchUpStatus: matchUp.matchUpStatus,
      matchUpStatusCodes: matchUp.matchUpStatusCodes,
      winningSide: matchUp.winningSide,
      score: matchUp.score,
      scoreHasValue: !!checkScoreHasValue({ score: matchUp.score }),
      scoredTime: !!matchUp.schedule?.scoredTime,
      roundPosition: matchUp.roundPosition,
      collectionId: matchUp.collectionId,
      matchUpFormat: storedFormat,
      ownMatchUpFormat: matchUp.matchUpFormat,
      validWinningScore: !LIVE_OR_UNSET.has(matchUp.matchUpStatus) && validWinningScore,
      carriedExit: isPropagatedExit({ matchUp }),
      hasSideExitProvenance: Object.values(matchUp.sideExitProvenance ?? {}).some(Boolean),
    },
    impliedWinningSide,
    propagatedExitStands,
    activeDownstream,
    ...(unreadableLink ? { unreadableLink } : {}),
    participants: {
      required: !!required,
      count,
      exitAwardable: exitAwardable(allAssignments, inContextMatchUp, request.winningSide),
      requireForScoring,
    },
    feedEligibilityBlockedBy: feed?.sourceRoundMatchUpId,
    correctionKindBlockedBy: kind?.blockingMatchUpId,
    swapMeetsActivePosition: swapMeetsActivePosition({
      loserTargetLink: targetData?.targetLinks?.loserTargetLink,
      loserMatchUp: targetData?.targetMatchUps?.loserMatchUp,
      inContextDrawMatchUps,
      inContextMatchUp,
      drawDefinition,
      structure,
      matchUp,
      request,
      event,
    }),
    line,
    dualProjection,
    targets: {
      winnerMatchUpId: targetData?.targetMatchUps?.winnerMatchUp?.matchUpId,
      loserMatchUpId: targetData?.targetMatchUps?.loserMatchUp?.matchUpId,
      luckyPreFeed: luckyPreFeed(drawDefinition, matchUp, structure),
      sideParticipantIds: {
        1: inContextMatchUp?.sides?.find((side) => side.sideNumber === 1)?.participantId,
        2: inContextMatchUp?.sides?.find((side) => side.sideNumber === 2)?.participantId,
      },
      sideDrawPositions: {
        1: inContextMatchUp?.sides?.find((side) => side.sideNumber === 1)?.drawPosition,
        2: inContextMatchUp?.sides?.find((side) => side.sideNumber === 2)?.drawPosition,
      },
      // a winner link out of the structure, with or without a winner matchUp (a qualifying final places its winner by
      // position in the main structure): a final whose winner goes nowhere has none
      winnerLink: !!targetData?.targetLinks?.winnerTargetLink,
      loserLink: targetData?.targetLinks?.loserTargetLink
        ? {
            linkCondition: targetData.targetLinks.loserTargetLink.linkCondition,
            targetRoundNumber: targetData.targetLinks.loserTargetLink.target?.roundNumber,
          }
        : undefined,
      byeTarget: !!targetData?.targetMatchUps?.byeMatchUp,
      loserMatchUpRoundNumber: targetData?.targetMatchUps?.loserMatchUp?.roundNumber,
      loserStructureId: targetData?.targetMatchUps?.loserMatchUp?.structureId,
      loserTargetDrawPosition: targetData?.targetMatchUps?.loserTargetDrawPosition,
      loserTargetSeat: loserTargetSeat(
        drawDefinition,
        targetData?.targetMatchUps?.loserMatchUp?.structureId,
        targetData?.targetMatchUps?.loserTargetDrawPosition,
        targetData?.targetMatchUps?.loserMatchUp?.drawPositions,
      ),
      loserThroughBye: throughBye(
        targetData?.targetMatchUps?.loserMatchUp,
        targetData?.targetMatchUps?.loserTargetDrawPosition,
        draw,
      ),
      seededParticipantIds: (structure?.seedAssignments ?? []).flatMap(({ participantId }) =>
        participantId ? [participantId] : [],
      ),
      loserMatchUpStatus: targetData?.targetMatchUps?.loserMatchUp?.matchUpStatus,
      loserMatchUpHasResult: hasResult(targetData?.targetMatchUps?.loserMatchUp),
      loserMatchUpRecord: storedSideRecord(matchUpsMap, targetData?.targetMatchUps?.loserMatchUp?.matchUpId),
      swap: swapPath({
        loserTargetLink: targetData?.targetLinks?.loserTargetLink,
        inContextDrawMatchUps,
        inContextMatchUp,
        drawDefinition,
        matchUpsMap,
        structure,
        matchUp,
        request,
        event,
      }),
      winner: winnerTarget(targetData?.targetMatchUps?.winnerMatchUp, request.matchUpId, draw),
      winnerThroughBye: {
        1: throughBye(targetData?.targetMatchUps?.winnerMatchUp, sideDrawPosition(inContextMatchUp, 1), draw),
        2: throughBye(targetData?.targetMatchUps?.winnerMatchUp, sideDrawPosition(inContextMatchUp, 2), draw),
      },
      reservations: firstMatchReservations({
        winnerMatchUp: targetData?.targetMatchUps?.winnerMatchUp,
        positionBySide: {
          1: inContextMatchUp?.sides?.find((side) => side.sideNumber === 1)?.drawPosition,
          2: inContextMatchUp?.sides?.find((side) => side.sideNumber === 2)?.drawPosition,
        },
        sourceMatchUpId: request.matchUpId,
        sourceScored:
          !!request.winningSide && !isUnscoredOutcome({ matchUpStatus: request.matchUpStatus, score: request.score }),
        matchUpsMap,
        draw,
      }),
      source: sourcePlace(inContextDrawMatchUps, inContextMatchUp),
      loserMatchUpCarriesExit: carriesExit(targetData?.targetMatchUps?.loserMatchUp, draw),
      loserMatchUpCarriedStatuses: standingExits(targetData?.targetMatchUps?.loserMatchUp, request.matchUpId, draw),
      loserMatchUpCarriesSourceExit: carriesExitFrom(targetData?.targetMatchUps?.loserMatchUp, request.matchUpId),
      loserMatchUpDecidedForArrival: decidedForArrival({
        matchUp: targetData?.targetMatchUps?.loserMatchUp,
        inContextDrawMatchUps,
        drawDefinition,
      }),
      loserMatchUpDrawPositions: (targetData?.targetMatchUps?.loserMatchUp?.drawPositions ?? []).filter(
        (position): position is number => typeof position === 'number',
      ),
      priorWins: priorWins(inContextDrawMatchUps, inContextMatchUp),
      priorWinsBefore: priorWins(inContextDrawMatchUps, inContextMatchUp, true),
      priorLosses: priorLosses(
        inContextDrawMatchUps,
        inContextMatchUp,
        targetData?.targetMatchUps?.winnerMatchUp?.matchUpId,
      ),
    },
    group:
      roundRobinGroup({ inContextDrawMatchUps, inContextMatchUp, drawDefinition, matchUp, args }) ??
      adHocGroup({ inContextDrawMatchUps, inContextMatchUp, drawDefinition, matchUp, args }),
    draw: {
      // v1's `updateTallyIfNeeded`, on the structure it reads: the container a round-robin group sits in
      tallied:
        !!inContextMatchUp?.containerStructureId ||
        !!isAdHoc({ structure }) ||
        !!isLucky({ drawDefinition, structure }),
      // v1 propagates a BYE into a first-match feed a loser can no longer reach (`propagateUnfillableLoserBye`), set
      // going by a winner filling the round that feeds it
      // v1 writes a draw's missing edges before deciding (`ensureGoesTo`): edge repair is S2's `setEdges`
      storesEdges: !goesTo,
      isAdHoc: !!isAdHoc({ structure }),
      perMatchUpCompetition:
        getCompetitionPolicy({ tournamentRecord, drawDefinition, event }).competitionPolicy?.processingGranularity ===
        'PER_MATCHUP',
      teamRoundRobin: !!(matchUp.tieMatchUps && !matchUp.roundPosition && inContextMatchUp?.containerStructureId),
      includesBye: !!matchUp.drawPositions?.some((position) =>
        allAssignments.some((assignment) => assignment.bye && assignment.drawPosition === position),
      ),
      rotatingPartners: isRotatingPartnerDraw(drawDefinition, event),
      winRatio: structure?.finishingPosition === WIN_RATIO,
      combinedPointRoundRobin:
        structure?.finishingPosition === WIN_RATIO &&
        !!parse(incomingFormat ?? storedFormat ?? '')?.setFormat?.combinedPointTotal,
      timedTie: !!(inContextMatchUp?.collectionId && lastSetFormatIsTimed({ ...inContextMatchUp })),
    },
  };
}
