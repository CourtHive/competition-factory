import type { MatchUpWrite, Refusal } from './types';
import {
  DRAW_POSITION_ASSIGNED,
  DRAW_POSITION_OCCUPIED,
  MISSING_ASSIGNMENTS,
} from '@Constants/errorConditionConstants';

/**
 * The `differential` mode: v2 decided, v1 ran, and the two are compared before the result leaves.
 *
 * S2a re-implements the REFUSALS (§ 2). A refusal v1 raises from a write v2 does not plan (the exit cascade's) is an
 * apply-stage code: v2 accepting while v1 refuses with one of these is not a divergence. Every other disagreement
 * throws, with both answers and the matchUp named. Since S7 the § 3 `refused` routes are v2's own refusals
 * (`refuseRoute`: rows 28 and 6), so no status code is deferred; `MISSING_ASSIGNMENTS` stays, a manual-scoring line's.
 */
export const APPLY_STAGE_CODES: ReadonlySet<string> = new Set([
  // INVALID_TIME, INVALID_DATE and ANACHRONISM are not: v2 refuses a schedule as v1's writer refuses it, rows 16, 25
  // and 27 (`refusals.ts` `refuseSchedule`, S7)
  // DRAW_POSITION_ACTIVE is not one: v2 refuses a swap that meets an active FIRST_MATCHUP-fed seat (row 26, S4)
  // MUTATION_LOCKED is not: the engine asks a lock before the method runs (`executeMethod`), and nothing inside
  // `setMatchUpStatus` asks one, so neither pipeline is reached under a lock
  // § 2 row 19: the failure the error-path tests force on a cascade write (no engine code raises it), standing for a
  // write failing inside the cascade, which v2 does not plan
  'ERR_FORCED',
  // UNRECOGNIZED_MATCHUP_STATUS is not: § 3's `unrecognized` and `not directing` rows are not reached past row 6, every
  // valid status being directing or non-directing (`applyStageCodesRuled.test.ts`); were one reached, v2's fallthrough
  // row 6 against v1's code would be the divergence it is
  // INVALID_MATCHUP_STATUS is not: v2 refuses row 6's three clauses, the § 3 fallthrough included (`refuseRoute`, S7)
  // INVALID_MATCHUP_STATUS_BYE (`ERR_UNCHANGED_CANNOT_ASSIGN_BYE`) is not: row 28, a BYE without a seat (S7)
  // `attemptToModifyScore`'s `validToScore`: row 6's participants clause asked again after the dispatch, which only a
  // score with no winner skips. On a singles matchUp such a score is `removeDirectedParticipants`' (row 24's removal
  // clause); on a line of a dual under manual scoring (auto-calc disabled) it is `attemptToModifyScore`'s, and a seat
  // of the dual unassigned is refused here (`applyStageCodesRuled.test.ts`). v2 leaves manual scoring to v1 (item 3)
  MISSING_ASSIGNMENTS.code,
  // MISSING_DRAW_POSITIONS is not: v2 refuses it as v1 does, row 24, both clauses (v1's `missingDrawPositionsRefusal`
  // before the dispatch; `removeDirectedParticipants`' check after it, S7)
  // a refusal raised INSIDE the exit cascade, which `setMatchUpStatus` now returns rather than drops (F3,
  // CA 2026-10-04); v2 does not yet plan the cascade writes that raise it ("an exit carried into a swap")
  DRAW_POSITION_ASSIGNED.code,
  // its sibling from the same cascade: `directLoser` placing a loser on a seat another participant holds (census F2,
  // policy-off DOUBLE_ELIMINATION 8: 20477784 and 20537779 — a refusal after the direction wrote, not yet planned by v2)
  DRAW_POSITION_OCCUPIED.code,
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
  const diffs = keys.filter((k) => !same(norm(plan, k), norm(actual, k)));
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
