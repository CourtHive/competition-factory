import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, COMPLETED, BYE } from '@Constants/matchUpStatusConstants';

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

  // Provenance and the legacy codes describe the SAME exit, so they must live and die together.
  // Every site that blanks `matchUpStatusCodes` is unwinding the exit those codes described; if
  // provenance survives that, the matchUp keeps a reason for an exit that no longer exists — a
  // do/undo residue that the projection would otherwise only catch in the cells it happens to reach.
  const codes = matchUp.matchUpStatusCodes;
  const provenance = matchUp.sideExitProvenance;
  if (provenance && Object.keys(provenance).length && Array.isArray(codes) && !codes.length) {
    record(
      'PROVENANCE_OUTLIVES_CODES',
      `sideExitProvenance ${JSON.stringify(provenance)} survives an emptied matchUpStatusCodes`,
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

  // A double exit has no winner by definition — neither side advances.
  if (DOUBLE_EXITS.includes(matchUpStatus) && winningSide) {
    record('DOUBLE_EXIT_WITH_WINNING_SIDE', `${matchUpStatus} carries winningSide ${winningSide}`);
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
