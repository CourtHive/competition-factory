import {
  DOUBLE_WALKOVER,
  DOUBLE_DEFAULT,
  TO_BE_PLAYED,
  COMPLETED,
  DEFAULTED,
  WALKOVER,
  RETIRED,
  BYE,
} from '@Constants/matchUpStatusConstants';

/**
 * Defined HERE rather than imported from `@Validators/isExit`, so that ONE harness file runs
 * against any engine version the census needs to compare.
 *
 * `isAnyExit` is a 7.x addition. Overlaying this harness on v6.38.0 to take a baseline threw
 * `isAnyExit is not a function` on EVERY scenario — 249,900 `GENERATION_THROW` records and not one
 * real finding, because the sweep records a generation throw rather than failing on it. The
 * predicate itself is version-independent: `isExit` is byte-identical at v6.38.0 and HEAD, and the
 * two double-exit statuses have been in the vocabulary far longer, so stating it over constants
 * costs nothing and removes the only version-specific import in the harness.
 */
const isAnyExit = (matchUpStatus: any): boolean =>
  [DEFAULTED, WALKOVER, RETIRED, DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(matchUpStatus);

/**
 * Structural invariants over a draw, asserted after every mutation.
 *
 * These are deliberately the COMPLEMENT of `getStructureInconsistencies`, which already
 * covers WINNING_SIDE_WITHOUT_PARTICIPANT, WINNING_SIDE_ADVANCEMENT_MISMATCH,
 * WINNER_NOT_ADVANCED, DRAW_POSITION_UNASSIGNED, DRAW_POSITIONS_NOT_SORTED,
 * EXIT_CODE_ON_WINNER_SIDE and EXIT_WITHOUT_LOSER. Duplicating those here would double the
 * triage cost for no extra signal, so the matrix runs the repo checker alongside this and
 * reports both.
 *
 * Every rule below is one the engine itself already states somewhere — either as a validator
 * that rejects the shape on input, or as prose in a comment. A propagation path that writes a
 * shape `setMatchUpState` would refuse from a caller is the defect this file exists to catch.
 */

export type InvariantViolation = {
  rule: string;
  matchUpId?: string;
  structureId?: string;
  detail: string;
};

const DOUBLE_EXITS = [DOUBLE_WALKOVER, DOUBLE_DEFAULT];

const hasScoreValue = (score: any): boolean =>
  !!(score?.sets?.length || score?.scoreStringSide1 || score?.scoreStringSide2);

/**
 * A WINNING SIDE HOLDS SOMEBODY — or a seat still to be reached, opposite the exit that decided it (punch-list P60).
 *
 * `getStructureInconsistencies`' WINNING_SIDE_WITHOUT_PARTICIPANT asks this of non-exits only, because an exit can be
 * decided before its winner arrives (exit-propagation.md, "The pending propagated exit"), so an exit with an empty
 * winning side went unread by every check. P60 lived there: DOUBLE_ELIMINATION 8/6, `doubleExitPropagateBye: false`,
 * seed 20506968 (census F2 fixture). A correction made the Backdraw final a double walkover, the Main final's
 * Backdraw finalist was released across the link, and the produced WALKOVER was then awarded from a view taken before
 * the release: `Main|4|1` read WALKOVER ws=1 with side 1 empty and the Main winner, who exited nothing, on side 2,
 * for five steps until a later call rewrote it.
 *
 * Returns the reason when the winning side holds nobody and nothing explains why, else undefined. Measured over the
 * exitPropagation, testHarness and corpus suites (2026-10-21, hydrated matchUps) the winning side was empty 6,598
 * times, and every one is a shape the engine means:
 *
 * - **A carried exit, opponent not yet arrived** (5,782; e.g. `censusF1FeedRegression20261011` `Consolation|1|2`): the
 *   exit's loser stands on the other side, and their side's provenance records the exit.
 * - **The exit a double exit sends over its loser link** (710; e.g. `theWholeDrawIsTheSameInEveryOrder` `West|1|2`,
 *   `doubleExitPropagateBye: false`): nobody stands on either side; the losing side's provenance records the exit
 *   (`previousMatchUpStatus` a double exit) and whoever arrives on the other side wins it.
 * - **An exit recorded before the opponent arrives** (106; e.g. `exitBeforeArrivalCensus` `Main|2|3`, #5160): the
 *   occupant on the losing side exited, and no provenance stands on either side.
 *
 * So an empty winning side is pending only for a single exit, with nothing recorded on the winning side, and with the
 * exit accounted for on the losing side: its provenance records an exit, or its occupant made one. P60's shape fails
 * the second: the winning side's provenance records the produced exit itself. Not read where it cannot be: only a
 * hydrated matchUp (`hasContext`) names who stands on a side — a stored TEAM matchUp's `sides` hold lineUps and no
 * `participantId`, so read raw every dual and rubber in the corpus fired (2,012 times, all false) — and a BYE on the
 * winning side is BYE_WON's.
 *
 * Falsified: before the P60 fix it fires on exactly two schedules of every census window (`sched-w1`, `sched-w2`,
 * `sched-de`) and both census-fail sets replayed under `doubleExitPropagateBye: false` — 20506968 and 9301858, both
 * `Main|4|1` — and after it on none, under any of the three arms.
 */
const EXITS_AWAITING_AN_ARRIVAL = new Set([WALKOVER, DEFAULTED]);

function winningSideHoldsNobody(matchUp: any): string | undefined {
  const { winningSide, matchUpStatus, sides } = matchUp;
  if (![1, 2].includes(winningSide) || matchUp.hasContext !== true) return undefined;
  const sideOf = (sideNumber: number) => sides?.find((side: any) => side?.sideNumber === sideNumber);
  const winner = sideOf(winningSide);
  if (winner?.participantId || winner?.bye) return undefined;

  const provenance = matchUp.sideExitProvenance ?? {};
  const loserSideNumber = 3 - winningSide;
  const exitOnLoserSide =
    isAnyExit(provenance[loserSideNumber]?.matchUpStatus) || !!sideOf(loserSideNumber)?.participantId;
  const pending = EXITS_AWAITING_AN_ARRIVAL.has(matchUpStatus) && !provenance[winningSide] && exitOnLoserSide;
  if (pending) return undefined;

  return (
    `matchUpStatus ${matchUpStatus} awards winningSide ${winningSide}, which holds no participant` +
    (provenance[winningSide] ? ` and records ${JSON.stringify(provenance[winningSide])}` : '')
  );
}

/**
 * Per-matchUp rules.
 *
 * WINNING_SIDE_DOMAIN guards against arithmetic slips rather than logic errors: several
 * sites derive a side as `2 - drawPositions.indexOf(x)` or `3 - walkoverWinningSide`, both of
 * which yield 3 or -1 when the index lookup misses. Nothing downstream rejects those values.
 */
function matchUpInvariants(matchUp: any): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const { matchUpStatus, matchUpId, winningSide, score } = matchUp;
  const record = (rule: string, detail: string) => violations.push({ rule, matchUpId, detail });

  // Provenance must not outlive the exit it describes — but an emptied `matchUpStatusCodes` is NOT
  // sufficient evidence that the exit is gone.
  //
  // This rule originally read "codes and provenance live and die together", which #4823 showed to be
  // too strict: `attemptToModifyScore` coerces an absent `matchUpStatusCodes` to `[]`, so `[]` means
  // either "blank them" or "the caller supplied none". A matchUp can therefore be an exit still, with
  // provenance that legitimately stands, and an empty codes array. Measured there: 63 clears, 51 of
  // them leaving the matchUp still an exit.
  //
  // The residue this exists to catch is the OTHER case — a matchUp that is no longer an exit at all,
  // still carrying a reason for one. `isAnyExit`, not `isExit`, because the double exits are
  // precisely the statuses that stamp provenance.
  const codes = matchUp.matchUpStatusCodes;
  const provenance = matchUp.sideExitProvenance;
  const stillAnExit = isAnyExit(matchUpStatus);
  if (provenance && Object.keys(provenance).length && Array.isArray(codes) && !codes.length && !stillAnExit) {
    record(
      'PROVENANCE_OUTLIVES_EXIT',
      `sideExitProvenance ${JSON.stringify(provenance)} survives on a matchUp that is no longer an exit ` +
        `(matchUpStatus ${matchUpStatus}), with matchUpStatusCodes emptied`,
    );
  }

  if (winningSide !== undefined && winningSide !== null && ![1, 2].includes(winningSide)) {
    record('WINNING_SIDE_DOMAIN', `winningSide is ${JSON.stringify(winningSide)}, expected 1, 2 or absent`);
  }

  // setMatchUpState rejects `BYE` + winningSide from a caller as INCOMPATIBLE_MATCHUP_STATUS;
  // a propagation path must not write what the validator forbids.
  if (matchUpStatus === BYE && winningSide) {
    record('BYE_WITH_WINNING_SIDE', `BYE carries winningSide ${winningSide}`);
  }

  if (matchUpStatus === BYE && hasScoreValue(score)) {
    record('BYE_WITH_SCORE', `BYE carries a score: ${JSON.stringify(score)}`);
  }

  /**
   * A BYE cannot WIN. It is not a competitor; there is nobody there to advance.
   *
   * The two rules above read the matchUp's STATUS; this one reads which SIDE the result was awarded
   * to, and that is the whole difference. A matchUp relabelled COMPLETED with a BYE standing on the
   * WINNING side is rated clean by every status-only rule, and by `getDrawInconsistencies` too —
   * which is why the census never scored it and it survived this long.
   *
   * Measured shape: flipping FMLC/13 `Main|2|3` left `Consolation|2|3` COMPLETED with winningSide 1
   * over sides `[BYE, participant]`, and the BYE then advanced and "won" `Consolation|3|2` as well.
   *
   * ## Why the winning side and not merely the presence of a BYE
   *
   * The wider rule — ANY result on a matchUp with a BYE side — was measured first and is WRONG. It
   * fired 53 times across 8 draw types on both arms, and the great majority are the legitimate
   * inverse: the PARTICIPANT is the winning side and the BYE is the opponent, which is what a
   * propagated exit against an emptied position looks like. Reporting those would have buried the 4
   * real ones and made the rule read as noise. Narrowed to the awarded side, it reports exactly the
   * state that cannot be true.
   *
   * Scoped to sides that carry a real drawPosition. An empty feed slot awaiting an arrival is not a
   * BYE, and a `sides` entry with neither is not evidence of one.
   */
  const byeSide = (matchUp.sides ?? []).find((side: any) => side?.bye && typeof side?.drawPosition === 'number');
  if (byeSide && winningSide === byeSide.sideNumber) {
    record(
      'BYE_WON',
      `matchUpStatus ${matchUpStatus} awards winningSide ${winningSide} to side ${byeSide.sideNumber}, ` +
        `which is a BYE (drawPosition ${byeSide.drawPosition})`,
    );
  }

  /**
   * A matchUp with a BYE side is a BYE (`progressExitStatus` RULE 1): its participant advances through it. One standing
   * at TO_BE_PLAYED reads as a fixture to be scheduled against nobody, and it never occurs (CA, 2026-10-24; punch-list
   * P26). None of the BYE rules above saw it, because each reads a matchUp that IS a `BYE`, and this one has stopped
   * being one. Measured before the fix on sched-w1 (both arms, 18,000 steps): 4 seeds, every one a clear accepted on a
   * BYE matchUp; sched-w2: 0. `clearsABye` now leaves a BYE the BYE it is.
   *
   * Not the lines of a TEAM dual: a BYE dual's lines are generated at TO_BE_PLAYED with the dual's BYE side, which is how
   * a dual that is never played is represented, and they stay so (CA, 2026-10-24: "it's ok to leave the lines as they are
   * today"). The dual itself is the BYE.
   */
  if (byeSide && !matchUp.collectionId && (!matchUpStatus || matchUpStatus === TO_BE_PLAYED)) {
    record(
      'TO_BE_PLAYED_BESIDE_BYE',
      `matchUpStatus ${matchUpStatus ?? 'absent'} with side ${byeSide.sideNumber} a BYE (drawPosition ${byeSide.drawPosition})`,
    );
  }

  const emptyWinningSide = winningSideHoldsNobody(matchUp);
  if (emptyWinningSide) {
    record('WINNING_SIDE_EMPTY', emptyWinningSide);
  }

  // A double exit has no winner by definition — neither side advances.
  if (DOUBLE_EXITS.includes(matchUpStatus) && winningSide) {
    record('DOUBLE_EXIT_WITH_WINNING_SIDE', `${matchUpStatus} carries winningSide ${winningSide}`);
  }

  /**
   * An UNDECIDED matchUp has no winner. Nothing has happened in it yet.
   *
   * This is the residue rule for a COLLAPSE: when a participant is withdrawn from a matchUp the
   * status falls back to TO_BE_PLAYED, and a `winningSide` left standing describes a result over
   * participants who are no longer both there. `removeSubsequentRoundsParticipant` cleared the
   * winningSide only for exit statuses, so every non-exit collapse kept one — measured as
   * `Consolation|4|1` TO_BE_PLAYED with winningSide 1 over sides `[null, participant]`.
   *
   * `BYE` has its own rule above; this one covers TO_BE_PLAYED and an absent status.
   */
  if ((!matchUpStatus || matchUpStatus === TO_BE_PLAYED) && winningSide) {
    record(
      'UNDECIDED_WITH_WINNING_SIDE',
      `matchUpStatus ${matchUpStatus ?? 'absent'} carries winningSide ${winningSide}`,
    );
  }

  if ((!matchUpStatus || matchUpStatus === TO_BE_PLAYED) && hasScoreValue(score)) {
    record(
      'UNDECIDED_WITH_SCORE',
      `matchUpStatus ${matchUpStatus ?? 'absent'} carries a score: ${JSON.stringify(score)}`,
    );
  }

  if (matchUpStatus === COMPLETED && !winningSide) {
    record('COMPLETED_WITHOUT_WINNING_SIDE', 'COMPLETED with no winningSide');
  }

  // matchUpStatusCodes are position-dependent: index 0 maps to side 1, index 1 to side 2
  // (progressExitStatus.ts). A third entry cannot be mapped to a side at all.
  if (Array.isArray(matchUp.matchUpStatusCodes) && matchUp.matchUpStatusCodes.length > 2) {
    record(
      'STATUS_CODES_OVER_TWO_SIDES',
      `matchUpStatusCodes has ${matchUp.matchUpStatusCodes.length} entries: ${JSON.stringify(matchUp.matchUpStatusCodes)}`,
    );
  }

  return violations;
}

/**
 * Per-structure rules over positionAssignments.
 *
 * PARTICIPANT_DUPLICATED_IN_STRUCTURE is the residue signature of an advancement that ran
 * twice — the shape a non-idempotent cascade leaves behind.
 */
function structureInvariants(structure: any): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const { positionAssignments, structureId } = structure;
  const seen = new Map<string, number>();

  for (const assignment of positionAssignments ?? []) {
    const { participantId, drawPosition } = assignment;
    if (!participantId) continue;
    if (seen.has(participantId)) {
      violations.push({
        rule: 'PARTICIPANT_DUPLICATED_IN_STRUCTURE',
        structureId,
        detail: `participant ${participantId.slice(0, 8)} occupies drawPositions ${seen.get(participantId)} and ${drawPosition}`,
      });
    }
    seen.set(participantId, drawPosition);
  }

  // A participant cannot simultaneously be a BYE.
  for (const assignment of positionAssignments ?? []) {
    if (assignment.participantId && assignment.bye) {
      violations.push({
        rule: 'BYE_POSITION_WITH_PARTICIPANT',
        structureId,
        detail: `drawPosition ${assignment.drawPosition} is both a BYE and assigned to ${assignment.participantId.slice(0, 8)}`,
      });
    }
  }

  return violations;
}

function collectStructures(structures: any[], collected: any[]): void {
  for (const structure of structures ?? []) {
    collected.push(structure);
    if (structure.structures?.length) collectStructures(structure.structures, collected);
  }
}

/**
 * @param matchUps - inContext matchUps for the draw
 * @param drawDefinition - the draw whose structures supply positionAssignments
 */
export function getInvariantViolations({ matchUps, drawDefinition }): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  for (const matchUp of matchUps ?? []) violations.push(...matchUpInvariants(matchUp));

  const structures: any[] = [];
  collectStructures(drawDefinition?.structures ?? [], structures);
  for (const structure of structures) violations.push(...structureInvariants(structure));

  return violations;
}

export function describeViolations(violations: InvariantViolation[]): string {
  return violations
    .map((violation) => {
      const anchor = violation.matchUpId?.slice(0, 8) ?? violation.structureId?.slice(0, 8) ?? '-';
      return `${violation.rule} [${anchor}] ${violation.detail}`;
    })
    .join('\n');
}
