import { matchUpStatusScopes } from '@Constants/matchUpStatusScopes';
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';

type ScopeArgs = {
  matchUpStatus?: MatchUpStatusUnion | string;
  isTieMatchUp?: boolean;
  isDeciderMatchUp?: boolean;
  drawType?: string;
};

/**
 * Enforces the declared scope of a matchUpStatus — the first such enforcement in the vocabulary.
 *
 * Returns a human-readable reason when the status is used outside where it means anything, and
 * `undefined` otherwise. An unscoped status (which is nearly all of them) is always `undefined`, so
 * this can be called unconditionally without changing any existing behaviour.
 *
 * DELIBERATELY PERMISSIVE ABOUT MISSING CONTEXT. If `drawType` is unknown, a drawType-scoped status
 * is allowed through: refusing on absent context would reject callers that never supplied a drawType
 * and have worked for years. The check exists to catch a status used somewhere it cannot mean
 * anything, not to make context mandatory. The same holds for the matchUp: a tie-scoped status is refused only when
 * the caller says it is NOT a tie rubber (and, where `deciderAllowed`, NOT a Decider); a caller that has not found the
 * matchUp passes neither and refuses nothing here.
 */
export function getMatchUpStatusScopeViolation({
  matchUpStatus,
  isDeciderMatchUp,
  isTieMatchUp,
  drawType,
}: ScopeArgs): string | undefined {
  if (!matchUpStatus) return undefined;
  const scope = matchUpStatusScopes[matchUpStatus as MatchUpStatusUnion];
  if (!scope) return undefined;

  if (scope.drawTypes && drawType && !scope.drawTypes.includes(drawType)) {
    return `${matchUpStatus} requires drawType ${scope.drawTypes.join(' | ')} — ${scope.reason}`;
  }
  const deciderExempt = scope.deciderAllowed && isDeciderMatchUp !== false;
  if (scope.tieMatchUpOnly && isTieMatchUp === false && !deciderExempt) {
    const where = scope.deciderAllowed ? 'a tie matchUp or a Decider' : 'a tie matchUp';
    return `${matchUpStatus} is valid only on ${where} — ${scope.reason}`;
  }
  return undefined;
}
