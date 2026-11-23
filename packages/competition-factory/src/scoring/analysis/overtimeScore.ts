import { shootoutTallyRefusal } from '@Helpers/matchUpFormatCode/shootout';
import { resolveFormat } from '@Helpers/matchUpFormatCode/matchRule';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { decideMatch } from '@Scoring/kernel/decide';

// constants and types
import { COMPLETED, IN_PROGRESS } from '@Constants/matchUpStatusConstants';
import type { MatchRule } from '@Helpers/matchUpFormatCode/matchRule';
import type { ScoredSet, SideNumber } from '@Scoring/kernel/types';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';

type StaticSet = {
  setNumber?: number;
  side1Score?: number;
  side2Score?: number;
  side1TiebreakScore?: number;
  side2TiebreakScore?: number;
  winningSide?: number;
  segmentComplete?: boolean;
};

export type OvertimeScoreVerdict =
  | { applies: false }
  | { applies: true; valid: true; winningSide?: number }
  | { applies: true; valid: false; reason: string };

/**
 * The static score path's verdict on an overtime format's score, asked of the scoring engine's own decision
 * (`decideMatch`) so the two cannot disagree. `applies` is false for any format without `-O:`; every other path
 * keeps its own reading.
 *
 * - no set may follow the point at which the match was decided (overtime after a decided regulation, a period
 *   past an unequal non-exact total, a decider after an unequal overtime);
 * - a closed sudden-death period ends on its first score, so both sides cannot have scored in it;
 * - COMPLETED must be decided, with the stated winner (a level finish names none); IN_PROGRESS must not be;
 * - `decidedIn: 'EXTERNAL'` (standings slice 2: a shootout, competition rule, lots or official decision) may
 *   carry a winner where the sporting score is level, so the level-finish refusal does not apply to it.
 */
export function overtimeScoreVerdict(params: {
  matchUpStatus?: MatchUpStatusUnion;
  matchUpFormat?: string;
  winningSide?: number;
  sets?: StaticSet[];
  decidedIn?: string;
}): OvertimeScoreVerdict {
  const { matchUpFormat, matchUpStatus, winningSide, decidedIn } = params;
  if (!matchUpFormat || !parse(matchUpFormat)?.overtimeFormat) return { applies: false };

  const rule = resolveFormat(matchUpFormat, { allowOvertime: true });
  if (!rule?.overtime)
    return { applies: true, valid: false, reason: 'the scoring engine does not score this overtime format' };

  const sets = params.sets ?? [];
  const open = matchUpStatus === IN_PROGRESS;
  const scored = sets.map((set, i) => toScoredSet(set, i, open && i === sets.length - 1));

  const sequence = sequenceViolation(rule, scored);
  if (sequence) return { applies: true, valid: false, reason: sequence };

  const decision = decideMatch(rule, scored);
  if (matchUpStatus === COMPLETED) {
    if (decidedIn === 'EXTERNAL') return { applies: true, valid: true, winningSide };
    if (!decision.complete) return { applies: true, valid: false, reason: 'the score does not complete the match' };
    if (decision.winningSide !== (winningSide as SideNumber | undefined))
      return { applies: true, valid: false, reason: 'winningSide is not the side the score decides' };
    return { applies: true, valid: true, winningSide: decision.winningSide };
  }
  if (matchUpStatus === IN_PROGRESS && decision.complete)
    return { applies: true, valid: false, reason: 'an in-progress score already decides the match' };
  return { applies: true, valid: true };
}

/**
 * Where the scoring engine decides an overtime format's closed sets: `complete`, and the winner of a decided match
 * (none for a level finish). `undefined` for any format without `-O:`, or one the engine does not score.
 */
export function overtimeDecision(
  sets: StaticSet[] | undefined,
  matchUpFormat?: string,
): { complete: boolean; winningSide?: number } | undefined {
  if (!matchUpFormat || !parse(matchUpFormat)?.overtimeFormat) return undefined;
  const rule = resolveFormat(matchUpFormat, { allowOvertime: true });
  if (!rule?.overtime) return undefined;
  const { complete, winningSide } = decideMatch(
    rule,
    (sets ?? []).map((set, i) => toScoredSet(set, i, false)),
  );
  return { complete, winningSide };
}

/**
 * The sequence half of the verdict, for callers that ask only which set could not have been played (`setCount`):
 * a set after the match was decided, or a sudden-death period both sides scored in. `undefined` when the sets
 * follow the format, and for any format without `-O:`. Every set is read as closed.
 */
export function overtimeSetAfterDecision(sets: StaticSet[], matchUpFormat?: string): string | undefined {
  if (!matchUpFormat || !parse(matchUpFormat)?.overtimeFormat) return undefined;
  const rule = resolveFormat(matchUpFormat, { allowOvertime: true });
  if (!rule?.overtime) return undefined;
  return sequenceViolation(
    rule,
    sets.map((set, i) => toScoredSet(set, i, false)),
  );
}

function sequenceViolation(rule: MatchRule, scored: ScoredSet[]): string | undefined {
  const suddenDeathScore = suddenDeathViolation(rule.n, rule.overtime!, scored);
  if (suddenDeathScore) return suddenDeathScore;
  const shootoutTally = shootoutViolation(rule, scored);
  if (shootoutTally) return shootoutTally;
  for (let k = 1; k < scored.length; k++) {
    if (decideMatch(rule, scored.slice(0, k)).complete)
      return `Set ${scored[k].setNumber}: played after the match was decided`;
  }
  return undefined;
}

function toScoredSet(set: StaticSet, index: number, open: boolean): ScoredSet {
  const isTiebreakOnly = set.side1TiebreakScore !== undefined || set.side2TiebreakScore !== undefined;
  const pair = isTiebreakOnly
    ? [set.side1TiebreakScore ?? 0, set.side2TiebreakScore ?? 0]
    : [set.side1Score ?? 0, set.side2Score ?? 0];
  // a static score need not state each set's winner; a closed unequal set has one (the decider's is the decision)
  const closed = !open || !!set.winningSide;
  const derived = (pair[0] > pair[1] && 1) || (pair[1] > pair[0] && 2) || undefined;
  const winningSide = (set.winningSide as SideNumber | undefined) ?? (closed ? derived : undefined);
  return {
    setNumber: set.setNumber ?? index + 1,
    side1Score: set.side1Score ?? 0,
    side2Score: set.side2Score ?? 0,
    ...(isTiebreakOnly ? { isTiebreakOnly, side1TiebreakScore: pair[0], side2TiebreakScore: pair[1] } : {}),
    ...(winningSide ? { winningSide } : {}),
    // a static set is a closed one, but for the last set of a score still in progress
    ...(closed ? { segmentComplete: true } : {}),
  };
}

/** a shootout decider's tally must be one a shootout can end on (Ruling 3) */
function shootoutViolation(rule: MatchRule, sets: ScoredSet[]): string | undefined {
  const { overtime, final } = rule;
  if (final?.kind !== 'shootout' || !overtime || overtime.count === 'unlimited') return undefined;
  const decider = sets[rule.n + overtime.count];
  const refusal = decider && shootoutTallyRefusal(final.rounds, [decider.side1Score, decider.side2Score]);
  return refusal ? `Set ${decider.setNumber}: ${refusal}` : undefined;
}

function suddenDeathViolation(
  n: number,
  overtime: { suddenDeath?: boolean; count: number | 'unlimited' },
  sets: ScoredSet[],
): string | undefined {
  if (!overtime.suddenDeath) return undefined;
  const end = overtime.count === 'unlimited' ? sets.length : n + overtime.count;
  for (let i = n; i < Math.min(end, sets.length); i++) {
    const { side1Score, side2Score } = sets[i];
    if (side1Score > 0 && side2Score > 0)
      return `sudden-death period ${i - n + 1} ends on its first score: both sides cannot have scored in it`;
  }
  return undefined;
}
