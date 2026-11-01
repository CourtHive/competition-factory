import type { MatchUp, MatchUpStatusUnion } from '@Types/tournamentTypes';

/**
 * Classification points by result (the E1 proposal, Mentat `planning/ROUND_ROBIN_RESULT_POINTS.md`; spec § 5.2): FIBA's
 * 2 for a win, 1 for a played or defaulted loss and 0 for a forfeit; volleyball's 3 for a 3-0 or 3-1 win and 2 for a
 * 3-2. Rules are matched in order and the first that matches decides. A rule names statuses explicitly; the factory
 * never infers a sport's "forfeit" or "default" from a status it was not told about.
 */
export type ResultPointsRule = {
  id: string;
  /** a drawn result: both sides take `points` */
  isDrawn?: boolean;
  points?: number;
  /** a decided result with one of these statuses (any status when omitted) */
  matchUpStatuses?: MatchUpStatusUnion[];
  /** a decided result in which the loser won one of these numbers of sets (any when omitted) */
  loserSetsWon?: number[];
  winner?: number;
  loser?: number;
};

export type ResultPoints = { rules: ResultPointsRule[] };

type ApplyResultPointsArgs = {
  ledger: Record<string, any>;
  resultPoints: ResultPoints;
  matchUp: MatchUp;
  isDrawn: boolean;
};

/**
 * One matchUp's classification points, added into the ledger: `classificationPoints` per participant, and which rule
 * credited what (`classificationContributions`). A decided or drawn result no rule matches is listed on both
 * participants (`classificationUnmatched`), never counted as 0 in silence. An unfinished result earns nothing.
 */
export function applyResultPoints({ ledger, resultPoints, matchUp, isDrawn }: ApplyResultPointsArgs) {
  const sideIds = (matchUp.sides ?? []).map((side) => side?.participantId);
  for (const participantId of sideIds) {
    if (participantId && ledger[participantId]) ledger[participantId].classificationPoints ??= 0;
  }
  const { winningSide, matchUpStatus, matchUpId } = matchUp;
  if (!winningSide && !isDrawn) return;

  const loserIndex = winningSide ? 2 - winningSide : undefined;
  const loserSetsWon =
    loserIndex === undefined
      ? 0
      : (matchUp.score?.sets ?? []).filter((set) => set?.winningSide === loserIndex + 1).length;

  const rule = resultPoints.rules.find((candidate) =>
    isDrawn ? candidate.isDrawn : !candidate.isDrawn && decidedRuleMatches(candidate, matchUpStatus, loserSetsWon),
  );

  sideIds.forEach((participantId, index) => {
    const record = participantId && ledger[participantId];
    if (!record) return;
    if (!rule) {
      record.classificationUnmatched = [...(record.classificationUnmatched ?? []), matchUpId];
      return;
    }
    const isWinner = winningSide === index + 1;
    const points = Number((isDrawn && rule.points) || (isWinner ? rule.winner : rule.loser) || 0);
    record.classificationPoints += points;
    record.classificationContributions = [
      ...(record.classificationContributions ?? []),
      { matchUpId, ruleId: rule.id, points },
    ];
  });
}

function decidedRuleMatches(
  rule: ResultPointsRule,
  matchUpStatus: MatchUpStatusUnion | undefined,
  loserSetsWon: number,
) {
  if (rule.matchUpStatuses && !(matchUpStatus && rule.matchUpStatuses.includes(matchUpStatus))) return false;
  if (rule.loserSetsWon && !rule.loserSetsWon.includes(loserSetsWon)) return false;
  return true;
}
