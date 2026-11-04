import { isLevelScore } from '@Query/matchUps/roundRobinTally/drawnResults';
import { parse } from '@Helpers/matchUpFormatCode/parse';

// constants and types
import type { DecidedBy, DecidedByMethod, DecidedIn } from '@Types/scoring/types';
import { INVALID_SCORE } from '@Constants/errorConditionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import type { ResultType } from '@Types/factoryTypes';
import type { Score } from '@Types/tournamentTypes';

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
 *   judged by `overtimeScoreVerdict`, so it is not read here.
 */
export function decidedResultRefusal(params: {
  matchUpStatus?: string;
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
  if (!parse(matchUpFormat ?? '')?.overtimeFormat && !isLevelScore(score, matchUpFormat))
    return refuse('only a level score is decided outside it: this score decides the match, or is not complete');
  return undefined;
}

function tallyProblem(decidedBy: Partial<DecidedBy>, winningSide: number): string | undefined {
  const { tally, method } = decidedBy;
  if (method !== 'SHOOTOUT') return 'a tally is a shootout’s';
  const counts = Array.isArray(tally) && tally.length === 2 && tally.every((n) => Number.isInteger(n) && n >= 0);
  if (!counts || tally[0] === tally[1]) return 'decidedBy.tally is two unequal counts, side 1 first';
  if ((tally[0] > tally[1] ? 1 : 2) !== winningSide) return 'decidedBy.tally is won by the winningSide';
  return undefined;
}
