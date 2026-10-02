import type { MatchUpWrite, Refusal } from './types';
import {
  DRAW_POSITION_ACTIVE,
  INVALID_MATCHUP_STATUS,
  INVALID_MATCHUP_STATUS_BYE,
  MISSING_ASSIGNMENTS,
  MISSING_DRAW_POSITIONS,
  INVALID_TIME,
  MUTATION_LOCKED,
  UNRECOGNIZED_MATCHUP_STATUS,
} from '@Constants/errorConditionConstants';

/**
 * The `differential` mode: v2 decided, v1 ran, and the two are compared before the result leaves.
 *
 * S2a re-implements the REFUSALS (§ 2 rows 1 to 15). A refusal v1 raises from a write, or from a
 * route v2 does not yet express (§ 3's `unrecognized`, `notDirecting` and `fallthrough`), is an
 * apply-stage code: v2 accepting while v1 refuses with one of these is not a divergence until S2b
 * owns the routes. Every other disagreement throws, with both answers and the matchUp named.
 */
export const APPLY_STAGE_CODES: ReadonlySet<string> = new Set([
  INVALID_TIME.code,
  DRAW_POSITION_ACTIVE.code,
  MUTATION_LOCKED.code,
  'ERR_FORCED', // § 2 row 19: observed by the corpus, no constant declares it (spec OPEN 2)
  UNRECOGNIZED_MATCHUP_STATUS.code,
  INVALID_MATCHUP_STATUS.code,
  INVALID_MATCHUP_STATUS_BYE.code,
  MISSING_ASSIGNMENTS.code,
  MISSING_DRAW_POSITIONS.code,
]);

export class OutcomePipelineDivergence extends Error {
  readonly matchUpId?: string;
  readonly v1: string;
  readonly v2: string;
  constructor({ matchUpId, v1, v2 }: { matchUpId?: string; v1: string; v2: string }) {
    super(`outcome pipeline divergence on ${matchUpId ?? '(no matchUpId)'}: v1 ${v1}, v2 ${v2}`);
    this.name = 'OutcomePipelineDivergence';
    this.matchUpId = matchUpId;
    this.v1 = v1;
    this.v2 = v2;
  }
}

export type Comparison = { agree: boolean; deferred?: string; v1: string; v2: string };

/** compares what v2 decided with what v1 returned; `deferred` names an apply-stage code v2 did not reach */
export function compareDecisions(v2: Refusal | undefined, v1Code: string | undefined): Comparison {
  const v2Code = v2?.code;
  if (v2Code === v1Code) return { agree: true, v1: v1Code ?? 'ok', v2: v2Code ?? 'ok' };
  if (!v2Code && v1Code && APPLY_STAGE_CODES.has(v1Code))
    return { agree: true, deferred: v1Code, v1: v1Code, v2: 'ok' };
  return { agree: false, v1: v1Code ?? 'ok', v2: v2Code ?? 'ok' };
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * S2b: the planned write against the matchUp v1 wrote. Sets and codes are compared by value, with
 * `undefined` and `[]` both read as "none".
 */
export function compareWrites(plan: MatchUpWrite, actual: MatchUpWrite): { agree: boolean; v1: string; v2: string } {
  const keys: (keyof MatchUpWrite)[] = [
    'matchUpStatus',
    'winningSide',
    'scoreStringSide1',
    'scoreStringSide2',
    'sets',
    'matchUpFormat',
    'matchUpStatusCodes',
    'scoredTime',
  ];
  const listKeys = new Set<keyof MatchUpWrite>(['sets', 'matchUpStatusCodes']);
  const norm = (w: MatchUpWrite, k: keyof MatchUpWrite) =>
    listKeys.has(k) ? ((w[k] as unknown[] | undefined) ?? []) : w[k];
  const shapeKeys = new Set<keyof MatchUpWrite>(['scoreStringSide1', 'scoreStringSide2', 'sets']);
  const compared = plan.scoreShapeOpen ? keys.filter((k) => !shapeKeys.has(k)) : keys;
  const diffs = compared.filter((k) => !same(norm(plan, k), norm(actual, k)));
  // with the shape open, the score must still hold no result: no sets with games in them
  if (plan.scoreShapeOpen && ((actual.sets as unknown[] | undefined) ?? []).length) diffs.push('sets');
  if (!diffs.length) return { agree: true, v1: 'as planned', v2: 'as planned' };
  const show = (w: MatchUpWrite) => JSON.stringify(Object.fromEntries(diffs.map((k) => [k, w[k]])));
  return { agree: false, v1: show(actual), v2: show(plan) };
}

/**
 * What the differential mode actually compared, by route. A green differential run that compared
 * nothing is not evidence of anything, so the gate reads this and refuses an empty tally. Module
 * state on purpose: it counts across every engine call in a process and is reset by the caller.
 */
const tally: Record<string, { compared: number; deferred: number }> = {};

export function differentialTally(route: string, outcome: 'compared' | 'deferred'): void {
  tally[route] ??= { compared: 0, deferred: 0 };
  tally[route][outcome] += 1;
}

export function getDifferentialTally(): Record<string, { compared: number; deferred: number }> {
  return structuredClone(tally);
}

export function resetDifferentialTally(): void {
  for (const key of Object.keys(tally)) delete tally[key];
}
