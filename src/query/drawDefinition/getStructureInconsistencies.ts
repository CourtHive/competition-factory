import { getUnearnedLinkAdvancements } from '@Query/drawDefinition/getUnearnedLinkAdvancements';
import { getByeCrossings } from '@Query/drawDefinition/getByeCrossings';
import { finalize, hasErrorSeverity, Inconsistency } from '@Query/integrity/inconsistency';
import { isAnyExit, isDoubleExit, isExit } from '@Validators/isExit';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import {
  isPropagatedExit as sharedIsPropagatedExit,
  getSideExitProvenance,
  arrivedByResult,
  getExitSides,
} from '@Mutate/matchUps/matchUpStatus/sideExitProvenance';

// constants and types
import { DrawDefinition, Event, MatchUp, PositionAssignment, Structure, Tournament } from '@Types/tournamentTypes';
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { CONTAINER } from '@Constants/drawDefinitionConstants';
import { MatchUpsMap, ResultType } from '@Types/factoryTypes';
import type { HydratedMatchUp } from '@Types/hydrated';
import { SUCCESS } from '@Constants/resultConstants';
import {
  DOUBLE_WALKOVER,
  DOUBLE_DEFAULT,
  TO_BE_PLAYED,
  DEAD_RUBBER,
  CANCELLED,
  ABANDONED,
  BYE,
} from '@Constants/matchUpStatusConstants';

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
//  - BYE_ADVANCEMENT_MISSING_ACROSS_LINK: the participant opposite a BYE at the source round of a
//    cross-structure WINNER link is absent from the link's target, which is still undecided. The
//    within-structure check above stops at the structure; the settle that performs this crossing
//    (`crossLinksThroughByes`) and this check share one predicate, `getByeCrossing`, so a crossing
//    the engine owes and has not made is exactly what is reported (census w2 9100389: a
//    DOUBLE_ELIMINATION Backdraw champion stranded beside a propagated BYE scored clean).
//  - PROPAGATED_EXIT_LOST: the matchUp carries NATIVE exit provenance — the cascade's own
//    record that an exit was delivered to one of its sides — while its matchUpStatus says
//    no exit happened and no winner was awarded. The record and the status contradict each
//    other, and the status is the one that is wrong: an exit that arrived cannot un-arrive
//    without the provenance being withdrawn with it. Like BYE_ADVANCEMENT_MISSING this
//    cannot start from a winningSide (there is none), so it runs above that guard.
//  - EXIT_CODE_ON_WINNER_SIDE: on a single WALKOVER/DEFAULTED, a status code sits on
//    the winning side rather than the exiting (loser) side. "Single" is asked of
//    PROVENANCE, not of the status — see the check.
//  - UNCOLLAPSED_CONVERGENCE: `sideExitProvenance` records an exit DELIVERED into BOTH
//    sides, and the matchUp nevertheless carries a single-exit status. Two exits that
//    meet are a double exit that nobody wins; this is the record and the status
//    contradicting each other, with the status wrong. Severity `warning`: the stored
//    draw is not structurally corrupt — both positions are typically empty and it
//    renders — and the repair is the convergence-collapse work, not a read-time fix.
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
//  - ADVANCED_FROM_UNDECIDED: a participant stands in a later round although the matchUp that
//    delivered their drawPosition (the latest earlier round in the same structure holding it) has no
//    result: no winningSide, TO_BE_PLAYED, no BYE. Every winner-rooted check above starts from a decided
//    matchUp, so an advancement left behind when its result was withdrawn is invisible to all of them
//    (census w2 9100343, 2026-10-04: a walkover re-scored to the other winner left its winner one round
//    on; #5157 fixed that release).
//  - ADVANCED_ACROSS_LINK_FROM_UNDECIDED: a participant stands in a link's target structure, at or after the
//    target round, although the source-round matchUp they play in has no result. Advancing across a WINNER or
//    LOSER link means that matchUp was decided; ADVANCED_FROM_UNDECIDED reads only within a structure, so an
//    advancement left behind across a link was invisible to every check (design § 3.1: clearing `Backdraw|3|1`
//    left its finalist in the grand final and the Decider, and the draw read clean; CA approved the check
//    2026-10-05).
//  - TWO_POSITIONS_FROM_ONE_FEEDER: both drawPositions of a matchUp were delivered by the same earlier matchUp
//    in the structure, which sends exactly one on. A BYE holder whose other seat was empty advanced its lone
//    position, and a participant passing the BYE later was added beside it (census w2 9100198, Consolation|5|1
//    [1, 3]); the next arrival then evicted one of the two. A round a link feeds is not checked: a position fed
//    across the link keeps its own number there (DOUBLE_ELIMINATION's Main final, a rematch of the semifinal).
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
export const BYE_ADVANCEMENT_MISSING_ACROSS_LINK = 'BYE_ADVANCEMENT_MISSING_ACROSS_LINK';
export const DRAW_POSITION_UNASSIGNED = 'DRAW_POSITION_UNASSIGNED';
export const DRAW_POSITIONS_NOT_SORTED = 'DRAW_POSITIONS_NOT_SORTED';
export const EXIT_CODE_ON_WINNER_SIDE = 'EXIT_CODE_ON_WINNER_SIDE';
export const EXIT_WITHOUT_LOSER = 'EXIT_WITHOUT_LOSER';
export const PROPAGATED_EXIT_LOST = 'PROPAGATED_EXIT_LOST';
export const UNCOLLAPSED_CONVERGENCE = 'UNCOLLAPSED_CONVERGENCE';
export const STALLED_POSITION = 'STALLED_POSITION';
export const ORIGIN_ON_UNDECIDED_MATCHUP = 'ORIGIN_ON_UNDECIDED_MATCHUP';
export const ADVANCED_FROM_UNDECIDED = 'ADVANCED_FROM_UNDECIDED';
export const ADVANCED_ACROSS_LINK_FROM_UNDECIDED = 'ADVANCED_ACROSS_LINK_FROM_UNDECIDED';
export const TWO_POSITIONS_FROM_ONE_FEEDER = 'TWO_POSITIONS_FROM_ONE_FEEDER';

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
// The check belongs at the mutation boundary, and is there: a carried exit records its
// origin (`sideExitProvenance.sourceMatchUpId`), and `reconcileStaleExitOrigins`
// withdraws one whose origin stopped being a double exit (P40). A DIRECT walkover
// carries no provenance, so a read-only scan still cannot tell it from a stale one.
// See Mentat TASKS.md for the full disposition.

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
 * ADVANCED_FROM_UNDECIDED — see the header. Positions are read per side; a position first appearing in this
 * round (an initial or fed slot) has no feeder and is skipped, and so is a feeder holding a BYE (a BYE
 * advancement is structural, not a result) or carrying any status other than TO_BE_PLAYED (an exit, pending or
 * awarded, or a BYE, is not "undecided" for this purpose).
 */
function getAdvancedFromUndecidedInconsistencies(
  matchUp: HydratedMatchUp,
  structureMatchUps: HydratedMatchUp[],
): StructureInconsistency[] {
  const found: StructureInconsistency[] = [];
  const roundNumber = matchUp.roundNumber ?? 0;
  for (const side of matchUp.sides ?? []) {
    if (!side?.participantId || !side.drawPosition) continue;
    const feeder = feederOf(side.drawPosition, roundNumber, structureMatchUps);
    if (!feeder || feeder.winningSide) continue;
    if (feeder.matchUpStatus && feeder.matchUpStatus !== TO_BE_PLAYED) continue;
    if ((feeder.sides ?? []).some((feederSide) => feederSide?.bye)) continue;
    found.push({
      matchUpId: matchUp.matchUpId,
      structureId: matchUp.structureId,
      issueType: ADVANCED_FROM_UNDECIDED,
      message: 'a participant stands in this matchUp although the matchUp that delivered them has no result',
      participantId: side.participantId,
      drawPosition: side.drawPosition,
      feederMatchUpId: feeder.matchUpId,
    });
  }
  return found;
}

/** the latest matchUp of an earlier round in the same structure that holds `drawPosition`: the one that delivered it */
function feederOf(
  drawPosition: number,
  roundNumber: number,
  structureMatchUps: HydratedMatchUp[],
): HydratedMatchUp | undefined {
  return structureMatchUps
    .filter(
      (candidate) => (candidate.roundNumber ?? 0) < roundNumber && candidate.drawPositions?.includes(drawPosition),
    )
    .reduce<HydratedMatchUp | undefined>(
      (latest, candidate) => (!latest || (candidate.roundNumber ?? 0) > (latest.roundNumber ?? 0) ? candidate : latest),
      undefined,
    );
}

/**
 * TWO_POSITIONS_FROM_ONE_FEEDER — see the header. Both of a matchUp's positions were delivered by the SAME earlier
 * matchUp, which sends one on. A fed position appears first in this round and has no feeder, so it is never counted.
 */
function getTwoFromOneFeederInconsistency(
  matchUp: HydratedMatchUp,
  structureMatchUps: HydratedMatchUp[],
): StructureInconsistency | undefined {
  const positions = (matchUp.drawPositions ?? []).filter((position): position is number => !!position);
  if (positions.length !== 2 || !matchUp.roundNumber) return undefined;
  const [first, second] = positions.map((position) => feederOf(position, matchUp.roundNumber ?? 0, structureMatchUps));
  if (!first || first.matchUpId !== second?.matchUpId) return undefined;
  return {
    matchUpId: matchUp.matchUpId,
    structureId: matchUp.structureId,
    issueType: TWO_POSITIONS_FROM_ONE_FEEDER,
    message: 'both drawPositions of this matchUp were delivered by the same earlier matchUp, which sends one on',
    drawPositions: positions,
    feederMatchUpId: first.matchUpId,
  };
}

function getAllAdvancedFromUndecided(
  scoped: HydratedMatchUp[],
  inContextDrawMatchUps: HydratedMatchUp[],
  roundRobinGroupStructureIds: Set<string>,
  linkTargetRounds: Set<string>,
): StructureInconsistency[] {
  const matchUpsByStructure = new Map<string, HydratedMatchUp[]>();
  for (const matchUp of inContextDrawMatchUps) {
    if (matchUp.collectionId || roundRobinGroupStructureIds.has(matchUp.structureId)) continue;
    const list = matchUpsByStructure.get(matchUp.structureId) ?? [];
    list.push(matchUp);
    matchUpsByStructure.set(matchUp.structureId, list);
  }
  return scoped.flatMap((matchUp) => {
    const structureMatchUps = matchUpsByStructure.get(matchUp.structureId);
    if (!structureMatchUps) return [];
    // a round a link feeds receives a position from ANOTHER structure under its own number here: the Backdraw champion
    // re-enters DOUBLE_ELIMINATION's Main final on their Main drawPosition, beside the semifinal they lost (a rematch)
    const fedByLink = linkTargetRounds.has(`${matchUp.structureId}|${matchUp.roundNumber}`);
    const twoFromOne = fedByLink ? undefined : getTwoFromOneFeederInconsistency(matchUp, structureMatchUps);
    return [
      ...getAdvancedFromUndecidedInconsistencies(matchUp, structureMatchUps),
      ...(twoFromOne ? [twoFromOne] : []),
    ];
  });
}

/** BYE_ADVANCEMENT_MISSING_ACROSS_LINK — see the header; the predicate is `getByeCrossing`. */
function getCrossLinkByeAdvancementInconsistencies(
  drawDefinition: DrawDefinition,
  inContextDrawMatchUps: HydratedMatchUp[],
  structureId?: string,
): StructureInconsistency[] {
  return getByeCrossings({ inContextDrawMatchUps, drawDefinition })
    .filter((crossing) => !structureId || crossing.matchUp.structureId === structureId)
    .map((crossing) => ({
      matchUpId: crossing.matchUp.matchUpId,
      structureId: crossing.matchUp.structureId,
      issueType: BYE_ADVANCEMENT_MISSING_ACROSS_LINK,
      message: 'the participant opposite a BYE did not advance across the WINNER link into its target matchUp',
      winnerMatchUpId: crossing.winnerMatchUp.matchUpId,
      participantId: crossing.participantId,
    }));
}

/** ADVANCED_ACROSS_LINK_FROM_UNDECIDED — see the header; the predicate is `getUnearnedLinkAdvancements`. */
function getCrossLinkAdvancementInconsistencies(
  drawDefinition: DrawDefinition,
  inContextDrawMatchUps: HydratedMatchUp[],
  structureId?: string,
): StructureInconsistency[] {
  return getUnearnedLinkAdvancements({ inContextDrawMatchUps, drawDefinition })
    .filter(({ targetMatchUp }) => !structureId || targetMatchUp.structureId === structureId)
    .map(({ link, sourceMatchUp, targetMatchUp, participantId }) => ({
      matchUpId: targetMatchUp.matchUpId,
      structureId: targetMatchUp.structureId,
      issueType: ADVANCED_ACROSS_LINK_FROM_UNDECIDED,
      message: `a participant stands in this matchUp across a ${link.linkType} link, although the matchUp they play in the source round has no result`,
      sourceMatchUpId: sourceMatchUp.matchUpId,
      linkType: link.linkType,
      participantId,
    }));
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
 * ## Provenance, and only provenance
 *
 * The question is whether the cascade actually stamped its own record here. `getSideExitProvenance`
 * used to fall back to the legacy `matchUpStatusCodes` array and could return stale entries, which
 * would have turned every stale legacy code into a reported defect — so this check read the
 * fallback-free `getSideExitProvenance`. P37 removed the fallback and with it that second
 * reader, so the one remaining reader answers exactly the question this check asks.
 *
 * ## What is deliberately NOT flagged
 *
 * A BYE, and any status that IS an exit (single or double) — those are the cascade's own outcomes,
 * not its erasure. A matchUp with a `winningSide` is excluded too: whatever else may be wrong with
 * it, its exit was not silently dropped, and `EXIT_CODE_ON_WINNER_SIDE` / `EXIT_WITHOUT_LOSER`
 * already govern that shape.
 */
/**
 * ORIGIN_ON_UNDECIDED_MATCHUP — `sideExitProvenance` records where a side CAME FROM, on a matchUp
 * that is neither an exit nor a BYE.
 *
 * **Punch-list P19, and what it turned out to need.** The entry was filed as a READER hazard:
 * `isPropagatedExit` tests that the field is non-empty, *"so one bad writer silently flips every
 * exclusion"*. Re-measured 2026-09-29 by re-creating the over-permissive writer that entry cites
 * (both `participatesInExitCascade` gates forced open) under each reading:
 *
 * | reader | failures |
 * |---|---|
 * | PRESENCE — as it was | 64 |
 * | CONTENT — asks the entry whether it carries an exit | 63 |
 *
 * So the reader was never the mechanism. 58 of those failures are one property,
 * `DO_UNDO_IDENTITY`: the writer leaves a RECORD on an ordinary advancement and the undo does not
 * take it back. Nothing is being fooled; the draw is simply carrying a fact about a matchUp it does
 * not describe. And the entry it leaves is a genuine carried exit, so reading content instead of
 * presence cannot tell it from a real one either — the matchUp's own status is what gives it away.
 *
 * That makes it a job for a detector rather than for a reader. An origin is a fact about how a side
 * came to be in a CONTEST THAT HAS BEEN DECIDED WITHOUT BEING PLAYED: an exit, a double exit, or a
 * BYE. On a matchUp that is still to be played, or was played, there is nothing for it to explain.
 *
 * A BYE claim ledger (`byeClaims` alone) is exempt. It records which double exits claim a BYE, is
 * written at the point of the attempt, and carries no origin.
 *
 * **SEVERITY `error`, and the population is ZERO.** Measured over 1,440 draws played to exhaustion —
 * 126,786 matchUp-states carrying provenance, sampled after every step — and over the full suite,
 * which asserts `valid` throughout. A writer that stamps an origin where none belongs now fails
 * every one of those assertions at once, instead of 58 tests about something else.
 */
function getStrayOriginInconsistency(matchUp: any): StructureInconsistency | undefined {
  const { matchUpStatus, matchUpId, structureId } = matchUp;
  if (isAnyExit(matchUpStatus)) return undefined;

  // A BYE is decided without being played too, so it may record a carried exit, a BYE that arrived
  // through a BYE, and a claim ledger. What it may not record is an arrival BY RESULT: a participant
  // who got there by winning advanced THROUGH the BYE, and nothing was contested for that to explain.
  const onBye = matchUpStatus === BYE;
  const provenance = getSideExitProvenance({ matchUp });
  const sideNumbers = ([1, 2] as const).filter((sideNumber) => {
    const entry = provenance?.[sideNumber];
    if (!onBye) return !!(entry?.matchUpStatus || entry?.previousMatchUpStatus || entry?.sourceMatchUpId);
    return arrivedByResult(entry);
  });
  if (!sideNumbers.length) return undefined;

  return {
    message: onBye
      ? `side ${sideNumbers.join(' and ')} records an arrival by result, on a BYE`
      : `side ${sideNumbers.join(' and ')} records where it came from, but the matchUp is ${matchUpStatus} and is neither an exit nor a BYE`,
    issueType: ORIGIN_ON_UNDECIDED_MATCHUP,
    structureId,
    matchUpId,
  };
}

function getLostPropagatedExitInconsistency(matchUp: any): StructureInconsistency | undefined {
  const { matchUpStatus, winningSide, matchUpId } = matchUp;
  if (winningSide || matchUpStatus === BYE || isAnyExit(matchUpStatus)) return undefined;

  const provenance = getSideExitProvenance({ matchUp });
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

/**
 * THE STATUSES THAT SAY A MATCHUP WILL NEVER BE PLAYED — CA, 2026-09-29.
 *
 * *"DEAD_RUBBER, CANCELLED, ABANDONED should all silence stalls. All of those say that a matchup
 * isn't ever going to be played (and any matchUps fed by the matchUp that won't be played are also
 * excluded)."*
 *
 * These are the only statuses `STALLED_POSITION` consults, and they are a different kind of thing
 * from the `TO_BE_PLAYED` gate it dropped. That gate could be quietened by a partial propagation fix
 * stamping a carried exit onto a stalled matchUp. None of these is a status an exit carries: each is
 * a statement, made by a person or by `reconcileDecider`, that nobody is expected here.
 */
const NEVER_TO_BE_PLAYED = new Set<string>([DEAD_RUBBER, CANCELLED, ABANDONED]);

/**
 * The matchUps that will never be played, and everything they feed.
 *
 * FED is followed through both `winnerMatchUpId` and `loserMatchUpId`, and all the way down: a
 * matchUp waiting on one that will never be played cannot produce anybody either, so whoever waits
 * on IT is waiting on the same decision.
 */
function getNeverToBePlayed(drawMatchUps: any[]): Set<string> {
  const excluded = new Set<string>();
  const matchUpById = new Map(drawMatchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));
  const pending = drawMatchUps.filter((matchUp) => NEVER_TO_BE_PLAYED.has(matchUp.matchUpStatus));

  while (pending.length) {
    const matchUp = pending.pop();
    if (!matchUp || excluded.has(matchUp.matchUpId)) continue;
    excluded.add(matchUp.matchUpId);
    for (const targetId of [matchUp.winnerMatchUpId, matchUp.loserMatchUpId]) {
      const target = targetId && matchUpById.get(targetId);
      if (target) pending.push(target);
    }
  }

  return excluded;
}

/**
 * STALLED_POSITION — a participant in a match that can never be played, in a draw that has stopped.
 *
 * ## Why every other rule here is blind to it
 *
 *  - `DRAW_POSITION_UNASSIGNED` opens `if (!matchUp.winningSide …) continue` — a stall has no
 *    `winningSide`, so it is skipped.
 *  - `BYE_ADVANCEMENT_MISSING` requires `byeSides.length === 1 && participantSides.length === 1` — a
 *    stall is VACANT-versus-participant, not BYE-versus-participant, so it is skipped.
 *
 * Measured 2026-09-23: COMPASS 16/14, ONE `DOUBLE_WALKOVER` at `East|1|2`, play everything else —
 * `Southwest|1|1` ends `(empty) vs <participant>` and `getDrawInconsistencies` returned
 * `valid: true`. At 4 byes the same action strands THREE.
 *
 * ## TWO conditions, and the second was learned the hard way
 *
 * The shape "undecided, one participant, one vacant side" describes a stalled matchUp AND a
 * legitimately PENDING one. Nothing about the matchUp separates them — the confusion that makes
 * `PROPAGATED_EXIT_LOST` over-report.
 *
 * 1. **Nothing in the draw is playable.** If nothing is playable, nothing is pending.
 * 2. **The draw has actually STARTED** — at least one matchUp decided.
 *
 * Condition 2 is not decoration. Without it this rule fired **94 times** across the suite on its
 * first run, because a draw whose positions are not yet assigned ALSO has nothing playable. "Nothing
 * playable" conflates *finished* with *not yet begun*, and a not-yet-begun draw is full of matchUps
 * holding one participant against a seat their opponent has not been drawn into yet. The suite
 * caught it; the first version of this docblock claimed condition 1 was sufficient.
 *
 * The cost is stated: this reports LATE and cannot warn a director mid-event. A per-position
 * reachability rule could, and remains the better long-term answer — it needs its own oracle and its
 * own falsification harness first.
 *
 * ## `matchUpStatus` IS NOT CONSULTED, and that is the third condition — measured 2026-09-26
 *
 * (With one exception, ruled 2026-09-29 and kept apart from this argument: a matchUp that will never
 * be played, and what it feeds. See `NEVER_TO_BE_PLAYED`.)
 *
 * This rule originally required the stalled matchUp to be `TO_BE_PLAYED`. That made it **quietable by
 * a partial propagation fix**: a fix that stamps the carried exit onto the stalled matchUp changes
 * nothing about the vacant seat, but the status is then `WALKOVER` and the old gate skipped it. The
 * participant stayed exactly as stranded and the finding disappeared, which reads as progress.
 *
 * Measured over the 600 `exitPropagationMatrix` cells at their own seeds
 * (`src/tests/query/stalledPositionOracle.test.ts`): with the status gate the detector saw **70
 * cells**, while **93** were stalled — **23 cells reported nothing at all**, more than the 19 the
 * count had apparently closed since the pre-fix measurement of 89. The hidden shapes were
 * `WALKOVER` 18, `DEFAULTED` 17, `DOUBLE_WALKOVER` 1, `DOUBLE_DEFAULT` 1.
 *
 * The widening was falsified before it was taken, not after: the same 600 draws played to exhaustion
 * with **no exit at all** produce **0** stalls under the status-blind rule — 600 cells played, 600
 * terminal, zero findings. A draw completed by ordinary results cannot have stranded anybody, so any
 * finding in that arm would be a false positive by construction. There are none.
 *
 * Note carefully that `playableShape` below still carries the narrow test. Playability and stalling
 * are different questions: a `DOUBLE_WALKOVER` holding two participants is finished despite having no
 * `winningSide`, so widening the PLAYABILITY test would report a completed draw as in progress and
 * silence this rule everywhere.
 *
 * A `winningSide` still ends the enquiry here: somebody advanced out of that matchUp, so nobody is
 * stranded in it. Whether the RIGHT side was awarded is a separate defect (punch-list **P29**) —
 * measured at 4 of the same 600 cells, all `FEED_IN_CHAMPIONSHIP 16/16` `Consolation|6|1`, where the
 * winner is the vacant seat and the lone occupant lost. That is not this rule's question.
 */
function getStalledPositionInconsistencies(
  /** REPORTED over these — narrowed to one structure when the caller asked for one */
  scoped: MatchUp[],
  /**
   * ASKED of these — always the WHOLE draw. Computing playability over `scoped` would make an audit
   * of a finished EAST structure report stalls while WEST still had matches to play, and TMX's draw
   * audit passes a `structureId`.
   */
  allDrawMatchUps: MatchUp[],
  roundRobinGroupStructureIds: Set<string>,
): StructureInconsistency[] {
  /**
   * PLAYABILITY, which is a different question from being stalled and must stay narrow. A
   * `DOUBLE_WALKOVER` holding two participants has no `winningSide` and is nonetheless finished, so
   * widening this would report a completed draw as still in progress.
   */
  const playableShape = (matchUp: any) =>
    !matchUp.winningSide && (!matchUp.matchUpStatus || matchUp.matchUpStatus === TO_BE_PLAYED);
  const occupants = (matchUp: any) => (matchUp.sides ?? []).filter((side: any) => side?.participantId && !side?.bye);

  const drawMatchUps = (allDrawMatchUps as any[]).filter((matchUp) => !matchUp.collectionId);
  const anythingPlayable = drawMatchUps.some((matchUp) => playableShape(matchUp) && occupants(matchUp).length === 2);
  if (anythingPlayable) return [];

  const hasStarted = drawMatchUps.some((matchUp) => matchUp.winningSide);
  if (!hasStarted) return [];

  const neverToBePlayed = getNeverToBePlayed(drawMatchUps);

  const inconsistencies: StructureInconsistency[] = [];
  for (const matchUp of scoped as any[]) {
    // round-robin groups have no feeds: a vacant seat there is an entry problem, not a stall
    if (roundRobinGroupStructureIds.has(matchUp.structureId)) continue;
    // NO `winningSide` is the whole test. Deliberately NOT gated on `matchUpStatus` -- see above.
    if (matchUp.winningSide) continue;
    if ((matchUp.sides ?? []).some((side: any) => side?.bye)) continue;
    // nobody is waiting in a matchUp that will never be played, or in one such a matchUp feeds
    if (neverToBePlayed.has(matchUp.matchUpId)) continue;

    const present = occupants(matchUp);
    if (present.length !== 1) continue;

    /**
     * AN OCCUPANT WHO EXITED IS NOT WAITING FOR ANYBODY — CA, 2026-09-29.
     *
     * *"There is nothing to be done and it needs to be considered a valid end state."*
     *
     * The shape this rule looks for — one participant, no winner — cannot tell somebody who is owed
     * an opponent from somebody who has withdrawn. The record can: a side that arrived carrying an
     * exit says so in its provenance. COMPASS 16/16 at matrix seed 511, `doubleExitPropagateBye:
     * false`:
     *
     *     East|1|7        Ellen Lovelace is walked over
     *     West|1|4        and again
     *     South|1|2       she arrives carrying that exit; her opponent wins by WALKOVER
     *     Southeast|1|1   she arrives as that matchUp's loser, still carrying an exit, on side 2
     *                     side 1 was owed the loser of `South|1|1`, a DOUBLE_WALKOVER: an exit, nobody
     *
     * `Southeast|1|1` is a `DOUBLE_WALKOVER` holding one person, both of its sides exited, and it is
     * finished. Reporting her told a director that a player who had withdrawn three times was
     * stranded.
     *
     * ## Why this does not reopen what status-blindness closed
     *
     * The `TO_BE_PLAYED` gate was quietable because it read the MATCHUP's status, which a partial
     * propagation fix changes by stamping a carried exit onto a stalled matchUp — whoever is waiting
     * there is still waiting. This reads the exit on the OCCUPANT'S OWN side. An exit stamped
     * opposite somebody leaves their side without one, and they are still reported: that is the
     * second case in `stalledPositionExitedOccupant.test.ts`, and the reason it is there.
     */
    const occupantSideNumber = present[0].sideNumber;
    if (occupantSideNumber && getExitSides({ matchUp }).includes(occupantSideNumber)) continue;
    /**
     * A DOUBLE EXIT STRANDS NOBODY. Both of its sides have exited, so a lone occupant in it is somebody who
     * walked over or was defaulted, not somebody waiting. The exemption above reads the occupant's exit from
     * provenance, which a DIRECTLY recorded exit never writes: a DEFAULTED recorded against a participant alone in
     * the matchUp, later met by a produced exit on the empty side and collapsed into a DOUBLE_WALKOVER, left no
     * trace of who exited — and the detector flagged them (census 9700004, COMPASS 8/7, the early-exit arm;
     * `aDoubleExitStrandsNobody.test.ts`). Measured over every stall the 2026-10 campaign fixed, replayed on the
     * pre-fix dev 5ee57576ea: 69 of 69 were TO_BE_PLAYED with one occupant, none a double exit — this hides none.
     */
    if (isDoubleExit(matchUp.matchUpStatus)) continue;

    inconsistencies.push({
      matchUpId: matchUp.matchUpId,
      structureId: matchUp.structureId,
      issueType: STALLED_POSITION,
      /**
       * AN ERROR SINCE 2026-10-10 — promoted from the `warning` it shipped as.
       *
       * A stranded participant is a real defect: somebody is waiting for an opponent who can never
       * arrive, and a draw in that state cannot be completed. The rule shipped advisory because
       * reporting it as an `error` made `valid` false on 93 of the 600 exit-propagation matrix cells,
       * and every caller of `valid` would have gone red at once. The population was then ratcheted
       * down to zero (`stalledPositionBudget.test.ts`, deleted with the promotion as its header
       * instructed) and driven to zero at scale: seven randomised censuses of 40,000 scenarios per arm
       * in three arms (`allowChangePropagation` off and on, `doubleExitPropagateBye: false`), the
       * last of them (`dev` bdc5c4b258, 7.9.0) reading 0 / 0 / 0, with the eight frozen census
       * windows at zero and the shrink-only ratchets' OPEN lists empty. CA's rule for the promotion
       * was exactly that reading; the history is `Mentat/planning/STALLED_POSITION_AT_SCALE.md`.
       *
       * So `valid` is now false for a draw holding a stall, and the ordinary `valid` assertions
       * across the suite are the guard — strictly better than a budget.
       */
      severity: 'error',
      message:
        `side ${present[0].sideNumber} holds a participant whose opponent can never arrive — ` +
        `no matchUp in the draw is playable`,
      sideNumber: present[0].sideNumber,
      matchUpStatus: matchUp.matchUpStatus,
    });
  }
  return inconsistencies;
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

  inconsistencies.push(
    ...getStalledPositionInconsistencies(scoped, inContextDrawMatchUps, roundRobinGroupStructureIds),
  );

  const linkTargetRounds = new Set(
    (drawDefinition.links ?? []).map((link) => `${link.target?.structureId}|${link.target?.roundNumber}`),
  );
  inconsistencies.push(
    ...getAllAdvancedFromUndecided(scoped, inContextDrawMatchUps, roundRobinGroupStructureIds, linkTargetRounds),
  );

  inconsistencies.push(...getCrossLinkAdvancementInconsistencies(drawDefinition, inContextDrawMatchUps, structureId));
  inconsistencies.push(
    ...getCrossLinkByeAdvancementInconsistencies(drawDefinition, inContextDrawMatchUps, structureId),
  );

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

    const strayOrigin = getStrayOriginInconsistency(matchUp);
    if (strayOrigin) inconsistencies.push(strayOrigin);

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

    /**
     * HOW MANY SIDES HAD AN EXIT *DELIVERED* — asked of provenance, per side.
     *
     * **P37.** `singleExit` is a STATUS test, and the two checks below both mean *"only ONE side
     * exited"*. Those agree for a draw whose status matches its own record and part company for one
     * whose does not, which is precisely the case the eviction made visible. Provenance answers the
     * question directly, and the discriminator is `previousMatchUpStatus` being a DOUBLE exit —
     * DELIVERED into this side — rather than a single exit or a `COMPLETED`, which records that this
     * side's occupant ARRIVED having won one upstream. That distinction is stated in
     * MATCHUP_STATUS_CODES_PER_SIDE.md, where conflating the two reported correct draws as defects at
     * a measured 119 tests.
     *
     * This is NOT the widening this file's `codeString` docblock warns against. That warning is about
     * reading provenance out of `matchUpStatusCodes`, which produced 717 false positives; the array is
     * not consulted here at all.
     */
    const provenance: any = (matchUp as any).sideExitProvenance ?? {};
    const deliveredSides = ([1, 2] as const).filter((sideNumber) =>
      isDoubleExit(provenance[sideNumber]?.previousMatchUpStatus),
    ).length;

    /**
     * UNCOLLAPSED_CONVERGENCE — two exits met and the matchUp did not become a double exit.
     *
     * **P37 raised this, and it is PRE-EXISTING — measured identical on clean `dev` at the same
     * coordinates.** It was previously reported as `EXIT_CODE_ON_WINNER_SIDE`, which is the wrong
     * name for it: on such a matchUp the winning side genuinely DOES carry a delivered exit, so the
     * code is a faithful rendering of a corrupt status rather than a misplaced code. Evicting the exit
     * tenant is what made it visible — the projection used to overwrite this array with objects, which
     * `codeString` ignores — so the observation is KEPT here rather than lost to the narrowing above.
     *
     * Traced 2026-09-27 on `unwindRemovesDrawPosition` seed 9000036 (MODIFIED_FEED_IN_CHAMPIONSHIP
     * 8/8): a consolation matchUp with `drawPositions: [5, 6]`, both slots empty, two DELIVERED
     * `DOUBLE_WALKOVER` origins from different sources, settling as `WALKOVER` with `winningSide: 2`.
     * `deriveExitStateFromProvenance` on that same record returns `DOUBLE_WALKOVER` and no winner.
     *
     * The producing gate is `doubleExitAdvancement`'s `existingExit`, whose `!drawPositions.length`
     * half this matchUp fails. **Do not "fix" it by asking provenance there** — built and measured
     * 2026-09-27, it takes the suite from 4 failures to 21. What works is reconciling AFTER the
     * provenance merge, where both sides are known; see that site's docblock.
     *
     * **SEVERITY `error`, promoted 2026-09-27 once the population reached ZERO.** It shipped as a
     * `warning` because 52 of 192 re-score cells hit it and `error` would have flipped `valid` to false
     * for draws considered valid that day. The reconciliation closes all 52 — measured zero on the
     * 600-cell census, on both directions of the correction sweep, and on all three named
     * reproductions — so this is now a structural invariant and nothing should ever violate it. A
     * matchUp cannot carry an exit delivered into both sides and be a single exit; if one appears, the
     * draw IS wrong.
     *
     * The `uncollapsedConvergenceBudget` ratchet that sized it is deleted with this promotion, on its
     * own instruction: a budget at zero asserts nothing, and the ordinary `valid` assertions across the
     * suite are a stronger guard than a ceiling.
     */
    if (isExit(matchUpStatus) && deliveredSides === 2) {
      inconsistencies.push({
        ...base,
        issueType: UNCOLLAPSED_CONVERGENCE,
        message: 'provenance records an exit delivered into both sides, but the matchUp is a single exit',
      });
    }

    // EXIT_CODE_ON_WINNER_SIDE (ONE exiting side only — a convergence carries codes on both sides)
    if (singleExit && deliveredSides < 2 && codeString(matchUpStatusCodes?.[winningSide - 1])) {
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
      !sharedIsPropagatedExit({ matchUp })
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
  return { ...SUCCESS, valid: !hasErrorSeverity(finalized), inconsistencies: finalized };
}
