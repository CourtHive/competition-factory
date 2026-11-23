import { decidedRecordOf } from '@Scoring/analysis/decidedResult';

// constants and types
import type { MatchUp, MatchUpStatusUnion } from '@Types/tournamentTypes';
import type { DecidedByMethod, DecidedIn } from '@Types/scoring/types';

/**
 * Classification points by result (the E1 proposal, Mentat `planning/ROUND_ROBIN_RESULT_POINTS.md`; spec § 5.2): FIBA's
 * 2 for a win, 1 for a played or defaulted loss and 0 for a forfeit; volleyball's 3 for a 3-0 or 3-1 win and 2 for a
 * 3-2. Rules are matched in order and the first that matches decides. A rule names statuses explicitly; the factory
 * never infers a sport's "forfeit" or "default" from a status it was not told about.
 *
 * A `bonus` rule adds to what the deciding rule awarded instead of deciding (rugby's losing bonus, spec § 5.2): every
 * bonus rule that matches adds its points, so a result can earn more than one.
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
  /** a decided result the loser lost by no more than this: the sides' scores summed over every set, then subtracted */
  loserMarginAtMost?: number;
  /**
   * a decided result completed in one of these phases (any when omitted): the overtime records' `decidedIn`, EXTERNAL
   * for a winner decided outside the score; a result with no such record was decided in REGULATION
   */
  decidedIn?: DecidedIn[];
  /** a result decided outside its score by one of these methods (IIHF: a shootout win earns 2, its loss 1) */
  decidedBy?: DecidedByMethod[];
  winner?: number;
  loser?: number;
  /** adds to the deciding rule's award instead of deciding; never makes an unmatched result matched */
  bonus?: boolean;
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
  const sets = matchUp.score?.sets ?? [];
  const loserSetsWon = loserIndex === undefined ? 0 : sets.filter((set) => set?.winningSide === loserIndex + 1).length;
  const totals = [0, 1].map((index) =>
    sets.reduce((sum, set) => sum + Number((index ? set?.side2Score : set?.side1Score) ?? 0), 0),
  );
  const margin = loserIndex === undefined ? 0 : totals[1 - loserIndex] - totals[loserIndex];
  const decided = decidedRecordOf(matchUp.score);
  const matches = (candidate: ResultPointsRule) =>
    isDrawn
      ? !!candidate.isDrawn
      : !candidate.isDrawn && decidedRuleMatches(candidate, { matchUpStatus, loserSetsWon, margin, decided });

  const rule = resultPoints.rules.find((candidate) => !candidate.bonus && matches(candidate));
  const bonuses = rule ? resultPoints.rules.filter((candidate) => candidate.bonus && matches(candidate)) : [];

  sideIds.forEach((participantId, index) => {
    const record = participantId && ledger[participantId];
    if (!record) return;
    if (!rule) {
      record.classificationUnmatched = [...(record.classificationUnmatched ?? []), matchUpId];
      return;
    }
    const isWinner = winningSide === index + 1;
    for (const applied of [rule, ...bonuses]) {
      const points = Number((isDrawn && applied.points) || (isWinner ? applied.winner : applied.loser) || 0);
      // a bonus that awards this side nothing is not a contribution to it
      if (applied.bonus && !points) continue;
      record.classificationPoints += points;
      record.classificationContributions = [
        ...(record.classificationContributions ?? []),
        { matchUpId, ruleId: applied.id, points },
      ];
    }
  });
}

function decidedRuleMatches(
  rule: ResultPointsRule,
  result: {
    matchUpStatus?: MatchUpStatusUnion;
    loserSetsWon: number;
    margin: number;
    decided?: { decidedIn?: string; decidedBy?: { method?: string } };
  },
) {
  const { matchUpStatus, loserSetsWon, margin, decided } = result;
  if (rule.matchUpStatuses && !(matchUpStatus && rule.matchUpStatuses.includes(matchUpStatus))) return false;
  if (rule.loserSetsWon && !rule.loserSetsWon.includes(loserSetsWon)) return false;
  if (rule.loserMarginAtMost !== undefined && margin > rule.loserMarginAtMost) return false;
  const decidedIn = (decided?.decidedIn ?? 'REGULATION') as DecidedIn;
  if (rule.decidedIn && !rule.decidedIn.includes(decidedIn)) return false;
  const method = decidedIn === 'EXTERNAL' ? (decided?.decidedBy?.method as DecidedByMethod | undefined) : undefined;
  if (rule.decidedBy && !(method && rule.decidedBy.includes(method))) return false;
  return true;
}
