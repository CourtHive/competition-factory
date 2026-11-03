import type { MatchRule, SegmentRule } from './format';
import type { Pair } from './types';

/** Internal scoring rule; public activation waits for the score-record integration slice. */
export type OvertimeRule = {
  count: number | 'unlimited';
  exactly: boolean;
  suddenDeath: boolean;
  rule: SegmentRule;
};

/** Whether this is an overtime period, excluding both regulation and the final fallback. */
export function overtimeGoverns(match: MatchRule, setNumber: number): boolean {
  const overtime = match.overtime;
  return !!overtime && setNumber > match.n && (overtime.count === 'unlimited' || setNumber <= match.n + overtime.count);
}

export function overtimeFinalNumber(match: MatchRule): number | undefined {
  const overtime = match.overtime;
  return overtime && overtime.count !== 'unlimited' && match.final ? match.n + overtime.count + 1 : undefined;
}

/** Undefined is unbounded, not an instruction to allocate an array of periods. */
export function lastPlayableSet(match: MatchRule): number | undefined {
  if (match.overtime) {
    if (match.overtime.count === 'unlimited') return undefined;
    return match.n + match.overtime.count + (match.final ? 1 : 0);
  }
  return match.n + (match.mode === 'exactly' && match.aggregate && match.final ? 1 : 0);
}

/** A sudden-death period starts tied and ends at its first nonzero scoring event. */
export function overtimeTotalError(match: MatchRule, setNumber: number, totals: Pair): string | undefined {
  return match.overtime?.suddenDeath && overtimeGoverns(match, setNumber) && totals[0] > 0 && totals[1] > 0
    ? 'a sudden-death overtime total cannot have scoring by both sides'
    : undefined;
}
