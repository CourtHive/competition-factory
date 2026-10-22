import { generateTieMatchUpScore } from '@Assemblies/generators/tieMatchUpScore/generateTieMatchUpScore';
import { isValidMatchUpFormat, isWellFormedMatchUpFormat } from '@Validators/isValidMatchUpFormat';
import { hasPropagatedExitDownstream } from '@Query/drawDefinition/hasPropagatedExitDownstream';
import { feedEligibilityChange } from '@Mutate/matchUps/matchUpStatus/feedEligibilityGuard';
import { correctionKindChange } from '@Mutate/matchUps/matchUpStatus/correctionKindGuard';
import { getProjectedDualWinningSide } from '@Query/matchUp/getProjectedDualWinningSide';
import { isMatchUpEventType } from '@Helpers/matchUpEventTypes/isMatchUpEventType';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { getDrawPositionWinCount } from '@Query/matchUp/getDrawPositionWinCount';
import { resolveScoringFormat } from '@Query/hierarchical/resolveScoringFormat';
import { getTargetsDownstream } from '@Query/drawDefinition/isActiveDownstream';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { isDeciderStructure } from '@Query/drawDefinition/deciderStructures';
import { lastSetFormatIsTimed } from '@Query/matchUp/lastSetFormatisTimed';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { isRotatingPartnerDraw } from '@Validators/rotatingPartnerDraw';
import { checkScoreHasValue } from '@Query/matchUp/checkScoreHasValue';
import { isAnyExit, isDoubleExit, isExit } from '@Validators/isExit';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { positionTargets } from '@Query/matchUp/positionTargets';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { analyzeMatchUp } from '@Query/matchUp/analyzeMatchUp';
import { teamLevelMatchUps } from '@Acquire/teamLevelMatchUps';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { isAdHoc } from '@Query/drawDefinition/isAdHoc';
import { findStructure } from '@Acquire/findStructure';
import { matchUpsOf } from '@Acquire/structureMembers';
import { isObject } from '@Tools/objects';
import {
  getSideExitProvenance,
  carriedExitStatus,
  isPropagatedExit,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants and types
import { POLICY_TYPE_PROGRESSION, POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { BYE, COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { BuildViewArgs, OutcomeRequest, OutcomeView } from './types';
import { WIN_RATIO } from '@Constants/drawDefinitionConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import { TEAM } from '@Constants/matchUpTypes';
import type {
  DrawDefinition,
  Event,
  MatchUp,
  MatchUpStatusUnion,
  PositionAssignment,
  SideExitProvenanceEntry,
  Structure,
} from '@Types/tournamentTypes';

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
  const source = draw.inContextDrawMatchUps.find((candidate) => candidate.matchUpId === sourceMatchUpId);
  if (!source?.loserMatchUpId || !byeSeats.length) return false;
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
  return structureMatchUps
    .filter((feeder) => feeder.winnerMatchUpId === matchUp.matchUpId && feeder.matchUpStatus === BYE)
    .flatMap((feeder) => Object.values(getSideExitProvenance({ matchUp: feeder }) ?? {}))
    .filter((entry) => entry?.sourceMatchUpId !== sourceMatchUpId)
    .map((entry) => carriedExitStatus(entry))
    .filter((status): status is MatchUpStatusUnion => !!status);
}

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
): { 1: number; 2: number } {
  const sourceMatchUps = teamLevelMatchUps(inContextDrawMatchUps).filter(
    (m) => m.structureId === inContextMatchUp?.structureId && m.matchUpId !== inContextMatchUp?.matchUpId,
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

export function buildOutcomeView(args: BuildViewArgs): OutcomeView {
  const { tournamentRecord, drawDefinition, event, request, policyDefinitions } = args;
  const empty: OutcomeView = {
    hasDrawDefinition: !!drawDefinition,
    // before the matchUp is found only well-formedness is asked: v1 refuses a matchUp not found before a new use
    formatRecognized: !request.matchUpFormat || isWellFormedMatchUpFormat({ matchUpFormat: request.matchUpFormat }),
    drawType: drawDefinition?.drawType,
    found: false,
    isTeam: false,
    existing: { validWinningScore: false, scoreHasValue: false, scoredTime: false, carriedExit: false },
    propagatedExitStands: false,
    activeDownstream: false,
    participants: { required: false, count: 0, exitAwardable: false, requireForScoring: true },
    draw: { isAdHoc: false, teamRoundRobin: false, includesBye: false, timedTie: false },
    targets: {
      luckyPreFeed: false,
      sideParticipantIds: {},
      sideDrawPositions: {},
      priorWins: { 1: 0, 2: 0 },
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

  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const { matchUps: inContextDrawMatchUps } = getAllDrawMatchUps({
    nextMatchUps: true,
    tournamentRecord,
    inContext: true,
    drawDefinition,
    matchUpsMap,
    event,
  });
  const matchUp = matchUpsMap.drawMatchUps.find((m) => m.matchUpId === request.matchUpId);
  const inContextMatchUp = inContextDrawMatchUps?.find((m) => m.matchUpId === request.matchUpId);
  if (!matchUp || !inContextDrawMatchUps) return empty;
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
    matchUpsMap,
    targetData,
    structure,
    matchUp,
    drawDefinition,
  };
  const unreadableLink = targets.error
    ? { error: targets.error, info: targets.info, context: targets.context }
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
      loserLink: targetData?.targetLinks?.loserTargetLink
        ? {
            linkCondition: targetData.targetLinks.loserTargetLink.linkCondition,
            targetRoundNumber: targetData.targetLinks.loserTargetLink.target?.roundNumber,
          }
        : undefined,
      loserMatchUpRoundNumber: targetData?.targetMatchUps?.loserMatchUp?.roundNumber,
      loserStructureId: targetData?.targetMatchUps?.loserMatchUp?.structureId,
      loserMatchUpStatus: targetData?.targetMatchUps?.loserMatchUp?.matchUpStatus,
      loserMatchUpHasResult: hasResult(targetData?.targetMatchUps?.loserMatchUp),
      winner: winnerTarget(targetData?.targetMatchUps?.winnerMatchUp, request.matchUpId, draw),
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
      priorLosses: priorLosses(
        inContextDrawMatchUps,
        inContextMatchUp,
        targetData?.targetMatchUps?.winnerMatchUp?.matchUpId,
      ),
    },
    draw: {
      isAdHoc: !!isAdHoc({ structure }),
      teamRoundRobin: !!(matchUp.tieMatchUps && !matchUp.roundPosition && inContextMatchUp?.containerStructureId),
      includesBye: !!matchUp.drawPositions?.some((position) =>
        allAssignments.some((assignment) => assignment.bye && assignment.drawPosition === position),
      ),
      rotatingPartners: isRotatingPartnerDraw(drawDefinition, event),
      combinedPointRoundRobin:
        structure?.finishingPosition === WIN_RATIO &&
        !!parse(incomingFormat ?? storedFormat ?? '')?.setFormat?.combinedPointTotal,
      timedTie: !!(inContextMatchUp?.collectionId && lastSetFormatIsTimed({ ...inContextMatchUp })),
    },
  };
}
