import { overtimeDecision } from '@Scoring/analysis/overtimeScore';
import { isLevelScore } from '@Scoring/analysis/levelScore';
import { parse } from '@Helpers/matchUpFormatCode/parse';

// constants and types
import type { DecidedBy, DecidedByMethod, DecidedIn } from '@Types/scoring/types';
import type { MatchUpStatusUnion, Score } from '@Types/tournamentTypes';
import { INVALID_SCORE } from '@Constants/errorConditionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import type { ResultType } from '@Types/factoryTypes';

export const EXTERNAL = 'EXTERNAL';
export const DECIDED_IN: DecidedIn[] = ['REGULATION', 'OVERTIME', 'DECIDER', EXTERNAL];
export const DECIDED_BY_METHODS: DecidedByMethod[] = ['SHOOTOUT', 'COMPETITION_RULE', 'LOTS', 'OFFICIAL_DECISION'];

type DecidedRecord = { decidedIn?: string; decidedBy?: Partial<DecidedBy> };

/** The record of how a result was decided, where the overtime records keep it (`score.overtime`). */
export function decidedRecordOf(score?: Score): DecidedRecord | undefined {
  const overtime = (score as { overtime?: unknown } | undefined)?.overtime;
  return overtime && typeof overtime === 'object' ? (overtime as DecidedRecord) : undefined;
}

/** A result whose winner was decided outside its score (standings phase 2 § 1.1, the decided result). */
export function isDecidedOutsideScore(score?: Score): boolean {
  return decidedRecordOf(score)?.decidedIn === EXTERNAL;
}

/**
 * Standings phase 2 § 1.1 (CA 2026-11-04), the decided result: a level sporting score, kept as played, plus the
 * `winningSide` and a record of how the winner was decided (`decidedIn: 'EXTERNAL'` and `decidedBy`). Refuses a record
 * that does not describe one; `undefined` when the score carries no such record, or a sound one.
 *
 * - it completes the match and names the winner it decided;
 * - `decidedBy.method` is a shootout, a competition rule, lots or an official decision;
 * - a tally is a shootout's, two unequal counts, side 1 first, won by the winner;
 * - the score it decides is level: a score that decides the match needs no decision. A declared overtime's score is
 *   asked of the scoring engine (`overtimeDecision`): its regulation is played, its total is level and no period
 *   or decider played has decided it (a match abandoned level in overtime, or a shootout recorded outside it).
 */
export function decidedResultRefusal(params: {
  matchUpStatus?: MatchUpStatusUnion;
  matchUpFormat?: string;
  winningSide?: number;
  score?: Score;
}): ResultType | undefined {
  const { matchUpStatus, matchUpFormat, winningSide, score } = params;
  const record = decidedRecordOf(score);
  if (record?.decidedIn !== EXTERNAL) return undefined;
  const refuse = (info: string) => ({ error: INVALID_SCORE, info });

  if ((matchUpStatus ?? COMPLETED) !== COMPLETED || !winningSide)
    return refuse('a result decided outside its score is COMPLETED and names its winner');
  const decidedBy = record.decidedBy ?? {};
  if (!DECIDED_BY_METHODS.includes(decidedBy.method as DecidedByMethod))
    return refuse(`decidedBy.method must be one of ${DECIDED_BY_METHODS.join(', ')}`);
  for (const key of ['rule', 'note'] as const) {
    if (decidedBy[key] !== undefined && typeof decidedBy[key] !== 'string')
      return refuse(`decidedBy.${key} must be a string`);
  }
  const tallyRefusal = decidedBy.tally === undefined ? undefined : tallyProblem(decidedBy, winningSide);
  if (tallyRefusal) return refuse(tallyRefusal);
  const parsed = parse(matchUpFormat ?? '');
  const level = parsed?.overtimeFormat
    ? isLevelOvertimeScore(score, matchUpFormat)
    : isLevelScore(score, matchUpFormat);
  if (!level)
    return refuse('only a level score is decided outside it: this score decides the match, or is not complete');
  return undefined;
}

function isLevelOvertimeScore(score?: Score, matchUpFormat?: string): boolean {
  const parsed = parse(matchUpFormat ?? '');
  const sets = score?.sets ?? [];
  if (sets.length < (parsed?.exactly ?? parsed?.bestOf ?? 1)) return false;
  if (overtimeDecision(sets, matchUpFormat)?.winningSide) return false;
  const [side1, side2] = sets.reduce(([a, b], set) => [a + (set.side1Score ?? 0), b + (set.side2Score ?? 0)], [0, 0]);
  return side1 === side2;
}

function tallyProblem(decidedBy: Partial<DecidedBy>, winningSide: number): string | undefined {
  const { tally, method } = decidedBy;
  if (method !== 'SHOOTOUT') return 'a tally is a shootout’s';
  const counts = Array.isArray(tally) && tally.length === 2 && tally.every((n) => Number.isInteger(n) && n >= 0);
  if (!counts || tally[0] === tally[1]) return 'decidedBy.tally is two unequal counts, side 1 first';
  if ((tally[0] > tally[1] ? 1 : 2) !== winningSide) return 'decidedBy.tally is won by the winningSide';
  return undefined;
}
