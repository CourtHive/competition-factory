import { isPropagatedExit as sharedIsPropagatedExit } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { getNativeSideExitProvenance } from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';
import { finalize, Inconsistency } from '@Query/integrity/inconsistency';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { isAnyExit, isExit } from '@Validators/isExit';

// constants and types
import { DrawDefinition, Event, MatchUp, PositionAssignment, Structure, Tournament } from '@Types/tournamentTypes';
import { BYE, DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { CONTAINER } from '@Constants/drawDefinitionConstants';
import { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

// A decided matchUp asserts three invariants that the FMLC propagated-exit bugs kept
// violating (each is a distinct issueType so callers can filter):
//  - WINNING_SIDE_WITHOUT_PARTICIPANT: a non-exit decided matchUp whose winning side
//    holds no participant. (A PENDING propagated exit legitimately has an empty winner
//    slot, so exit statuses are excluded here — the advancement check covers them.)
//  - WINNING_SIDE_ADVANCEMENT_MISMATCH: the participant that advanced into this
//    matchUp's winnerMatchUp is the LOSER, not the participant on the winning side —
//    the exact drawPositions-sort-vs-winningSide drift (factory 97fc07b12).
//  - WINNER_NOT_ADVANCED: the winning-side participant is absent from its next matchUp
//    WITHIN the same structure. Winning advances unconditionally within a structure, so the
//    winner must be present. Cross-structure winnerMatchUpId feeds (a double-elimination
//    consolation-final winner feeding back into MAIN only if they have lost once) are
//    CONDITIONAL on history and excluded — the winner mirror of the FMLC loser-feed caveat.
//  - BYE_ADVANCEMENT_MISSING: the participant opposite a BYE is absent from its next
//    matchUp within the same structure. A BYE carries no winningSide ("a BYE is never
//    won" — CA, 2026-09-20), so none of the winner-rooted checks above can see it; this
//    is the one advancement invariant that has to start from the positionAssignment
//    instead. Bye-vs-bye and bye-vs-empty are excluded — neither has a participant whose
//    absence would mean anything.
//  - PROPAGATED_EXIT_LOST: the matchUp carries NATIVE exit provenance — the cascade's own
//    record that an exit was delivered to one of its sides — while its matchUpStatus says
//    no exit happened and no winner was awarded. The record and the status contradict each
//    other, and the status is the one that is wrong: an exit that arrived cannot un-arrive
//    without the provenance being withdrawn with it. Like BYE_ADVANCEMENT_MISSING this
//    cannot start from a winningSide (there is none), so it runs above that guard.
//  - EXIT_CODE_ON_WINNER_SIDE: on a single WALKOVER/DEFAULTED, a status code sits on
//    the winning side rather than the exiting (loser) side.
//  - DRAW_POSITIONS_NOT_SORTED: a matchUp's drawPositions are not stored ascending
//    (ignoring empty slots) — the sort invariant the rest of the engine relies on to
//    derive sides, fed positions (Math.min), and rendering. ROUND-ROBIN GROUP structures
//    (ITEM children of a CONTAINER) are EXCLUDED from this check: their matchUps store
//    drawPositions in Berger round-pairing order (e.g. [10,7]), and the engine normalizes
//    to ascending when deriving sides, so both participants always resolve correctly — the
//    stored order carries no meaning to sort against. Confirmed benign across the full prod
//    corpus (2026-07-01 audit). Elimination / feed / playoff structures still assert it,
//    because there the ascending invariant genuinely feeds position derivation.
//  - EXIT_WITHOUT_LOSER: a single WALKOVER/DEFAULTED with a winningSide whose LOSING
//    side holds no participant — a walkover with nobody who walked over (an orphaned
//    exit). A pending exit is not flagged: there the loser side holds the exit carrier.
//  - DRAW_POSITION_UNASSIGNED: a decided, non-exit matchUp references a drawPosition
//    whose stored positionAssignment holds no participant, no bye and no qualifier — a
//    phantom position. Read from STORED structure state (drawPositions ↔
//    positionAssignments) rather than inContext sides: inContext derives sides FROM the
//    assignments, so an empty LOSING slot on an otherwise-decided matchUp silently
//    resolves to a side with no participantId and is not surfaced by any inContext check
//    (WINNING_SIDE_WITHOUT_PARTICIPANT only inspects the winning side). Exits are excluded
//    because a legitimately pending propagated exit may hold an empty slot.
export const WINNING_SIDE_WITHOUT_PARTICIPANT = 'WINNING_SIDE_WITHOUT_PARTICIPANT';
export const WINNING_SIDE_ADVANCEMENT_MISMATCH = 'WINNING_SIDE_ADVANCEMENT_MISMATCH';
export const WINNER_NOT_ADVANCED = 'WINNER_NOT_ADVANCED';
export const BYE_ADVANCEMENT_MISSING = 'BYE_ADVANCEMENT_MISSING';
export const DRAW_POSITION_UNASSIGNED = 'DRAW_POSITION_UNASSIGNED';
export const DRAW_POSITIONS_NOT_SORTED = 'DRAW_POSITIONS_NOT_SORTED';
export const EXIT_CODE_ON_WINNER_SIDE = 'EXIT_CODE_ON_WINNER_SIDE';
export const EXIT_WITHOUT_LOSER = 'EXIT_WITHOUT_LOSER';
export const PROPAGATED_EXIT_LOST = 'PROPAGATED_EXIT_LOST';

// DEFERRED — STALE_EXIT_STATUS is intentionally NOT implemented.
//
// The proposed check: a single WALKOVER/DEFAULTED with a winningSide, no exit code, and
// no upstream feeder matchUp that is itself an exit (traversing winnerMatchUpId /
// loserMatchUpId back) — i.e. an exit status that should have collapsed to TO_BE_PLAYED.
//
// It cannot be shipped as a zero-false-positive check. A legitimate direct walkover (a
// player who did not show for a match) is stored with `matchUpStatusCodes: []`, has a
// winningSide, and has no upstream exit — indistinguishable, from stored state, from the
// hypothesised "stale" exit. `matchUpStatusCodes` is optional metadata that legitimate
// walkovers routinely omit (verified: `setMatchUpStatus({ matchUpStatus: WALKOVER,
// winningSide: 1 })` yields a `valid` draw with empty codes, and
// `generateOutcomeFromScoreString({ matchUpStatus: WALKOVER })` emits `[]`). The
// heuristic would therefore flag the entire codeless-walkover population across the
// fixtures corpus.
//
// There is no stored field that reliably marks an exit as "stale". A trustworthy check
// would need to re-derive whether the exit is still justified (upstream state) at the
// mutation boundary that produces it, not as a read-only post-hoc scan. No live trigger
// is known now that the FMLC collapse/block bugs are fixed. See Mentat TASKS.md for the
// full disposition.

type StructureInconsistency = {
  issueType: string;
  message: string;
  structureId?: string;
  matchUpId: string;
  [key: string]: any;
};

type GetStructureInconsistenciesArgs = {
  drawDefinition: DrawDefinition;
  tournamentRecord?: Tournament;
  matchUpsMap?: MatchUpsMap;
  structureId?: string;
  event?: Event;
};

/**
 * String value of a `matchUpStatusCodes` element, for the EXIT_CODE_ON_WINNER_SIDE check below.
 *
 * Deliberately narrow. The array holds three shapes — policy codes (`matchUpStatusCode`), exit
 * provenance (`matchUpStatus`/`previousMatchUpStatus`/`sideNumber`), and codes wrapped as `{ code }`
 * by `updateMatchUpStatusCodes` — and this reads only strings and that last wrapper. It is left
 * rather than widened, because widening it is measurably wrong:
 *
 * EXIT_CODE_ON_WINNER_SIDE means "an exit code sits on the winner's side rather than the loser's".
 * That is a rule about POLICY codes, which belong to the match and land on the exiting side.
 * Provenance describes BOTH sides, and `projectExitStatusCodes` emits both slots, so index
 * `winningSide - 1` is always occupied for a propagation-produced matchUp and the rule cannot hold
 * for it. Measured
 * 2026-09-10: teaching this function to read object elements produced 717 findings, all false
 * positives, and broke two named negative-control tests.
 *
 * The fix is the tenant split, not a wider read — once the array holds policy codes only, this
 * rule is correct as written. See Mentat/planning/MATCHUP_STATUS_CODES_PER_SIDE.md.
 */
function codeString(code: any): string | undefined {
  const value = typeof code === 'string' ? code : code?.code;
  return value || undefined;
}

// An exit is "produced by propagation" when the cascade stamped provenance on it — the marker it
// writes when a downstream slot resolves to a WALKOVER/DEFAULTED because an upstream double-exit
// (or fed exit) delivered no participant. Such an exit legitimately has an empty losing slot and
// must NOT be flagged as an orphan.
//
// POSITIONAL WRAPPER, deliberately. The shared predicate takes `{ matchUp }`; the detectors in this
// file and in `getDrawInconsistencies` pass the matchUp positionally. An agent reported this as a
// dead call with a mismatched signature; it is neither — it is re-exported and used at two live
// sites, and it discriminates correctly. Verify before "fixing" it.
export function isPropagatedExit(matchUp: any): boolean {
  // One reader for both schemas: prefers `sideExitProvenance`, falls back to the provenance shape
  // inside the legacy `matchUpStatusCodes`. Callers pass the matchUp, not the array, so the native
  // field is consultable at all.
  return sharedIsPropagatedExit({ matchUp });
}

/** @deprecated Use {@link isPropagatedExit}. */
export const exitProducedByPropagation = isPropagatedExit;

// A positionAssignment is "occupied" if it names a participant, a bye, or a (pending)
// qualifier. An empty assignment referenced by a decided non-exit matchUp is a phantom.
function assignmentOccupied(assignment: PositionAssignment | undefined): boolean {
  return !!(assignment && (assignment.participantId || assignment.bye || assignment.qualifier));
}

// Flatten a drawDefinition's structure tree into the leaf nodes that carry BOTH matchUps
// and positionAssignments. Round-robin CONTAINER structures carry neither (their groups,
// in `structures[]`, hold both), so recursion co-locates each matchUp with the assignments
// that govern its drawPositions.
function collectAssignedStructures(structures: Structure[] | undefined, collected: Structure[]): void {
  for (const structure of structures ?? []) {
    if (structure.positionAssignments?.length && structure.matchUps?.length) collected.push(structure);
    if (structure.structures?.length) collectAssignedStructures(structure.structures, collected);
  }
}

// Collect the structureIds of round-robin GROUP structures — the ITEM children of a
// CONTAINER. Their matchUps store drawPositions in Berger round-pairing order, not ascending,
// which is legitimate (see DRAW_POSITIONS_NOT_SORTED note), so they are exempted from the
// sort check. Playoff structures in a ROUND_ROBIN_WITH_PLAYOFF are NOT container children and
// are therefore (correctly) not exempted.
function collectRoundRobinGroupStructureIds(structures: Structure[] | undefined, ids: Set<string>): void {
  for (const structure of structures ?? []) {
    if (structure.structureType === CONTAINER) {
      for (const child of structure.structures ?? []) ids.add(child.structureId);
    }
    if (structure.structures?.length) collectRoundRobinGroupStructureIds(structure.structures, ids);
  }
}

// DRAW_POSITION_UNASSIGNED — stored-state pass. Independent of the inContext derivation so
// an empty losing slot on a decided matchUp cannot be masked by side derivation.
function getPhantomPositionInconsistencies(
  drawDefinition: DrawDefinition,
  structureId: string | undefined,
): StructureInconsistency[] {
  const inconsistencies: StructureInconsistency[] = [];
  const assignedStructures: Structure[] = [];
  collectAssignedStructures(drawDefinition.structures, assignedStructures);

  for (const structure of assignedStructures) {
    if (structureId && structure.structureId !== structureId) continue;
    const assignmentByPosition = new Map<number, PositionAssignment>(
      (structure.positionAssignments ?? []).map((assignment) => [assignment.drawPosition, assignment]),
    );

    for (const matchUp of (structure.matchUps ?? []) as MatchUp[]) {
      // decided, non-exit only — a pending propagated exit may legitimately hold an empty slot
      if (!matchUp.winningSide || matchUp.collectionId || isExit(matchUp.matchUpStatus)) continue;
      const filledPositions = (matchUp.drawPositions ?? []).filter(
        (drawPosition): drawPosition is number => typeof drawPosition === 'number',
      );
      const phantomPositions = filledPositions.filter(
        (drawPosition) =>
          assignmentByPosition.has(drawPosition) && !assignmentOccupied(assignmentByPosition.get(drawPosition)),
      );
      if (phantomPositions.length) {
        inconsistencies.push({
          matchUpId: matchUp.matchUpId,
          structureId: structure.structureId,
          issueType: DRAW_POSITION_UNASSIGNED,
          message:
            'decided matchUp references a drawPosition whose positionAssignment holds no participant, bye or qualifier',
          drawPositions: matchUp.drawPositions,
          phantomPositions,
        });
      }
    }
  }

  return inconsistencies;
}

/**
 * BYE_ADVANCEMENT_MISSING — the participant opposite a BYE is absent from its next matchUp.
 *
 * Checked SEPARATELY from every rule in the main loop, and it has to be: those all start from a
 * `winningSide`, and a BYE carries none — *"a BYE is never won"* (CA, 2026-09-20). That blindness is
 * not hypothetical. It is why `resetDrawDefinition` could strand every BYE advancement in a draw and
 * still have it rated `valid: true`, which is how the defect reached a user.
 *
 * Only bye-vs-participant is asserted, and both exclusions are load-bearing rather than defensive.
 * **Bye-vs-bye advances a drawPosition but no participant** (measured: a 16 draw with 3 entries
 * advances position 1 out of a `[1,2]` double bye), so there is nobody whose absence could mean
 * anything. **A BYE facing a still-empty slot** has nobody to advance yet.
 *
 * Deliberately NOT folded into `WINNER_NOT_ADVANCED`, for two reasons. Nobody won here, so the name
 * would contradict the standing ruling above; and that class is the headline series of the
 * exit-propagation census, which a new population silently merged into it would corrupt.
 */
function getByeAdvancementInconsistency(
  matchUp: any,
  matchUpById: Map<string, any>,
): StructureInconsistency | undefined {
  const { sides, winnerMatchUpId, matchUpId } = matchUp;
  if (!sides || !winnerMatchUpId) return undefined;

  const byeSides = sides.filter((side) => side.bye);
  const participantSides = sides.filter((side) => side.participantId && !side.bye);
  if (byeSides.length !== 1 || participantSides.length !== 1) return undefined;

  const winnerMatchUp = matchUpById.get(winnerMatchUpId);
  // cross-structure feeds are conditional on history — the same caveat WINNER_NOT_ADVANCED carries
  if (!winnerMatchUp || winnerMatchUp.structureId !== matchUp.structureId) return undefined;

  const advancingParticipantId = participantSides[0].participantId;
  if ((winnerMatchUp.sides ?? []).some((side) => side.participantId === advancingParticipantId)) return undefined;

  return {
    matchUpId,
    structureId: matchUp.structureId,
    issueType: BYE_ADVANCEMENT_MISSING,
    message: 'the participant opposite a BYE did not advance into its next matchUp within the structure',
    participantId: advancingParticipantId,
    winnerMatchUpId,
  };
}

/**
 * Winner advancement, for a matchUp that HAS a winningSide.
 *
 * `WINNING_SIDE_ADVANCEMENT_MISMATCH`: the loser advanced into the winnerMatchUp while the
 * winning-side participant did not. `WINNER_NOT_ADVANCED`: the winner is absent from its next
 * matchUp WITHIN the same structure (a genuine dropped advancement, since winning advances
 * unconditionally within a structure). Cross-structure `winnerMatchUpId` feeds are conditional on
 * history (a double-elimination consolation-final winner returns to MAIN only if they lost once)
 * and are excluded from `WINNER_NOT_ADVANCED` — the winner mirror of the FMLC loser-feed caveat.
 *
 * A BYE never reaches here: it carries no `winningSide`. `getByeAdvancementInconsistency` is the
 * counterpart that covers it.
 */
function getWinnerAdvancementInconsistency(
  matchUp: any,
  matchUpById: Map<string, any>,
  winnerSide: any,
  loserSide: any,
  base: any,
): StructureInconsistency | undefined {
  const { winnerMatchUpId } = matchUp;
  const winnerMatchUp = winnerMatchUpId ? matchUpById.get(winnerMatchUpId) : undefined;
  if (!winnerSide?.participantId || !winnerMatchUp) return undefined;

  const advancedParticipantIds = (winnerMatchUp.sides ?? [])
    .map((side) => side.participantId)
    .filter(Boolean) as string[];
  const winnerAdvanced = advancedParticipantIds.includes(winnerSide.participantId);
  const loserAdvanced = !!loserSide?.participantId && advancedParticipantIds.includes(loserSide.participantId);

  if (loserAdvanced && !winnerAdvanced) {
    return {
      ...base,
      issueType: WINNING_SIDE_ADVANCEMENT_MISMATCH,
      message: 'the losing-side participant advanced into the winnerMatchUp instead of the winning-side participant',
      advancedParticipantId: loserSide?.participantId,
      winningParticipantId: winnerSide.participantId,
      winnerMatchUpId,
    };
  }

  if (!winnerAdvanced && winnerMatchUp.structureId === matchUp.structureId) {
    return {
      ...base,
      issueType: WINNER_NOT_ADVANCED,
      message: 'winning-side participant did not advance into its next matchUp within the structure',
      winnerMatchUpId,
    };
  }

  return undefined;
}

/**
 * PROPAGATED_EXIT_LOST — the record says an exit arrived here; the status says nothing happened.
 *
 * ## Why this class was invisible
 *
 * Every other exit check in this file starts from a `winningSide` or from an exit `matchUpStatus`.
 * A matchUp whose exit has been ERASED has neither, so it fell through all of them and the draw
 * rated `valid: true` — the same structural blindness `BYE_ADVANCEMENT_MISSING` was added for on
 * 2026-09-21, where the check could not see a BYE because "a BYE is never won".
 *
 * Measured on `COMPASS 16/14 nonRandom: 20223109`: a `DOUBLE_WALKOVER` at `East|1|2` leaves
 * `West|2|1` a pending `WALKOVER` with provenance on side 1. A participant then arrives on side 2
 * and the status is rewritten to `TO_BE_PLAYED` while the provenance stays. The matchUp then reads
 * "a real participant versus nobody, to be played" — and it can never be played, because side 1's
 * drawPosition is fed by a double exit that advances no one. The draw has stopped, and nothing
 * reported it.
 *
 * ## Why NATIVE provenance, and only native
 *
 * `getSideExitProvenance` falls back to the legacy `matchUpStatusCodes` array and can return stale
 * entries; `getNativeSideExitProvenance` answers the narrower question this check needs — did the
 * cascade actually stamp its own record here. Reading the fallback would turn every stale legacy
 * code into a reported defect.
 *
 * ## What is deliberately NOT flagged
 *
 * A BYE, and any status that IS an exit (single or double) — those are the cascade's own outcomes,
 * not its erasure. A matchUp with a `winningSide` is excluded too: whatever else may be wrong with
 * it, its exit was not silently dropped, and `EXIT_CODE_ON_WINNER_SIDE` / `EXIT_WITHOUT_LOSER`
 * already govern that shape.
 */
function getLostPropagatedExitInconsistency(matchUp: any): StructureInconsistency | undefined {
  const { matchUpStatus, winningSide, matchUpId } = matchUp;
  if (winningSide || matchUpStatus === BYE || isAnyExit(matchUpStatus)) return undefined;

  const provenance = getNativeSideExitProvenance({ matchUp });
  if (!provenance) return undefined;

  /**
   * The provenance side must be EMPTY, and that is the whole discriminator.
   *
   * An exit means somebody did not play. A provenance entry sitting on a side that HOLDS a
   * participant is describing how that participant ARRIVED — measured on sweep seed 6161873
   * (OLYMPIC 16/16), where `East|3|2` is a perfectly ordinary `TO_BE_PLAYED` between two present
   * participants, one of whom reached it by winning a walkover at `East|2|4`. That record is
   * history, not an exit delivered into this matchUp, and flagging it reports a playable match as
   * a defect.
   *
   * A side that carries an exit record and no participant is the opposite: nobody is coming, and a
   * status saying "to be played" is a draw that has silently stopped.
   */
  const exitedSide = Object.keys(provenance).find((sideNumber) => {
    if (!isAnyExit(provenance[sideNumber]?.matchUpStatus)) return false;
    const side = (matchUp.sides ?? []).find((candidate: any) => candidate?.sideNumber === Number(sideNumber));
    return !side?.participantId && !side?.bye;
  });
  if (!exitedSide) return undefined;

  return {
    matchUpId,
    structureId: matchUp.structureId,
    issueType: PROPAGATED_EXIT_LOST,
    message: `side ${exitedSide} carries a propagated ${provenance[exitedSide]?.matchUpStatus} but the matchUp records no exit`,
    sideNumber: Number(exitedSide),
    carriedMatchUpStatus: provenance[exitedSide]?.matchUpStatus,
    sourceMatchUpId: provenance[exitedSide]?.sourceMatchUpId,
    matchUpStatus,
  };
}

export function getStructureInconsistencies(
  params: GetStructureInconsistenciesArgs,
): ResultType & { valid?: boolean; inconsistencies?: Inconsistency[] } {
  const { drawDefinition, structureId, matchUpsMap } = params;
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const inContextDrawMatchUps = getAllDrawMatchUps({ inContext: true, drawDefinition, matchUpsMap }).matchUps ?? [];
  const matchUpById = new Map(inContextDrawMatchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));

  const scoped = inContextDrawMatchUps.filter(
    (matchUp) => !matchUp.collectionId && (!structureId || matchUp.structureId === structureId),
  );

  const inconsistencies: StructureInconsistency[] = getPhantomPositionInconsistencies(drawDefinition, structureId);

  const roundRobinGroupStructureIds = new Set<string>();
  collectRoundRobinGroupStructureIds(drawDefinition.structures, roundRobinGroupStructureIds);

  for (const matchUp of scoped) {
    const { winningSide, matchUpStatus, matchUpStatusCodes, sides, matchUpId, drawPositions } = matchUp;

    // DRAW_POSITIONS_NOT_SORTED — the ascending-sort invariant. Exempt round-robin group
    // structures: they store drawPositions in Berger round-pairing order (benign).
    const filledPositions = (drawPositions ?? []).filter((drawPosition) => typeof drawPosition === 'number');
    const ascending = [...filledPositions].sort((a, b) => a - b);
    if (
      !roundRobinGroupStructureIds.has(matchUp.structureId) &&
      filledPositions.some((drawPosition, index) => drawPosition !== ascending[index])
    ) {
      inconsistencies.push({
        matchUpId,
        structureId: matchUp.structureId,
        issueType: DRAW_POSITIONS_NOT_SORTED,
        message: 'drawPositions are not stored in ascending order',
        drawPositions,
      });
    }

    const byeAdvancement = getByeAdvancementInconsistency(matchUp, matchUpById);
    if (byeAdvancement) inconsistencies.push(byeAdvancement);

    // above the winningSide guard deliberately: an ERASED exit has no winningSide to start from
    const lostExit = getLostPropagatedExitInconsistency(matchUp);
    if (lostExit) inconsistencies.push(lostExit);

    if (!winningSide || !sides) continue;

    // match by explicit sideNumber — a still-empty feed slot can be a side object with
    // no sideNumber, which would wrongly satisfy `sideNumber !== winningSide`
    const winnerSide = sides.find((side) => side.sideNumber === winningSide);
    const loserSide = sides.find((side) => side.sideNumber === (winningSide === 1 ? 2 : 1));
    const exit = isExit(matchUpStatus);
    const singleExit = exit && (!matchUpStatus || ![DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(matchUpStatus));
    const base = { matchUpId, structureId: matchUp.structureId, winningSide };

    // WINNING_SIDE_WITHOUT_PARTICIPANT (non-exit only — pending exits may be empty)
    if (!exit && !winnerSide?.participantId && !winnerSide?.bye) {
      inconsistencies.push({
        ...base,
        issueType: WINNING_SIDE_WITHOUT_PARTICIPANT,
        message: 'winningSide points to a side with no participant',
      });
    }

    // EXIT_CODE_ON_WINNER_SIDE (single exit only — double exits carry codes on both sides)
    if (singleExit && codeString(matchUpStatusCodes?.[winningSide - 1])) {
      inconsistencies.push({
        ...base,
        issueType: EXIT_CODE_ON_WINNER_SIDE,
        message: 'exit status code sits on the winning side rather than the exiting (loser) side',
      });
    }

    // EXIT_WITHOUT_LOSER (single exit whose loser slot is a FED position with no occupant —
    // an orphaned exit: a walkover recorded against a drawPosition that lost its participant).
    // Three legitimate empty-loser cases are excluded: (1) a pending exit holds its carrier;
    // (2) an exit whose losing slot was never fed (no loser drawPosition) because an upstream
    // double-exit produced no advancer; and (3) an exit the engine PRODUCED by propagation
    // into a fed-but-empty slot (loser drawPosition present but marked with a
    // `previousMatchUpStatus` provenance code — e.g. a consolation walkover fed a
    // double-walkover void). A genuine orphan carries no such provenance.
    if (
      singleExit &&
      loserSide?.drawPosition &&
      !loserSide.participantId &&
      !loserSide.bye &&
      !isPropagatedExit(matchUp)
    ) {
      inconsistencies.push({
        ...base,
        issueType: EXIT_WITHOUT_LOSER,
        message: 'exit matchUp has a winningSide but no participant on the losing (exiting) side',
      });
    }

    const advancement = getWinnerAdvancementInconsistency(matchUp, matchUpById, winnerSide, loserSide, base);
    if (advancement) inconsistencies.push(advancement);
  }

  const finalized = finalize(inconsistencies, { scope: 'STRUCTURE' });
  return { ...SUCCESS, valid: finalized.length === 0, inconsistencies: finalized };
}
