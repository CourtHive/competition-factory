import { getDrawPositionWinCount, isUnscoredOutcome } from '@Query/matchUp/getDrawPositionWinCount';

// constants and types
import { FIRST_MATCHUP, LOSER } from '@Constants/drawDefinitionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { DrawDefinition } from '@Types/tournamentTypes';

/**
 * Refuse a re-score that would change the feed eligibility of a loser who has ALREADY been directed.
 *
 * THE DEFECT, both halves of it. `FIRST_MATCH_LOSER_CONSOLATION` admits a loser only when they had
 * zero prior SCORED wins, and `getDrawPositionWinCount` does not count a walkover or an unscored
 * default as a win. So re-scoring an EARLIER matchUp can move a participant across that line, in
 * either direction, long after the feed decision was made — and nothing re-runs it:
 *
 *   - a win downgraded to a walkover makes a later loss their FIRST-match loss, and nobody feeds
 *     them: `DROPPED_PROGRESSION`, measured as 7 seeds across two 600-seed frozen windows;
 *   - a walkover corrected to a real win makes a consolation occupant retroactively ineligible, and
 *     nobody removes them: `INELIGIBLE_PROGRESSION`, 8 seeds, invisible until the integrity scan
 *     gained that direction.
 *
 * One cause: eligibility is evaluated when the loser is directed and never re-evaluated when the
 * facts underneath it change. CA ruled 2026-09-14 that a TD correcting a result with active
 * downstream dependencies is REFUSED rather than silently re-fed — the rule
 * `CANNOT_CHANGE_WINNING_SIDE` already applies one branch away.
 *
 * WHY IT IS THIS NARROW. A previous attempt refused on any scored/unscored flip in any draw holding
 * a `FIRST_MATCHUP` link, and an adversarial review reproduced seven classes of legitimate
 * correction it wrongly blocked: TEAM collection matchUps (which carry no `drawPositions` and so can
 * never affect a count), QUALIFYING and CONSOLATION structures (never the link's source), every
 * round rather than the rounds that can feed, cases where no feed decision existed yet, cases where
 * the participant WON instead of losing, and adding a score to an existing DEFAULTED. Each condition
 * below exists to exclude one of those, and the counterfactuals proved the point: the same edit made
 * in a different order was allowed, reached the identical end state, and left integrity clean. A
 * guard that is merely order-dependent protects nothing.
 *
 * Returns the offending context when the change must be refused, otherwise undefined.
 */
export function feedEligibilityChange({
  inContextDrawMatchUps,
  drawDefinition,
  matchUpStatus,
  winningSide,
  structure,
  matchUp,
  score,
}: {
  inContextDrawMatchUps?: any[];
  drawDefinition?: DrawDefinition;
  matchUpStatus?: string;
  winningSide?: number;
  structure?: any;
  matchUp?: any;
  score?: any;
}): { participantDrawPosition: number; sourceRoundMatchUpId?: string } | undefined {
  // a collection matchUp (a rubber inside a tie) has no drawPositions, so no count can depend on it
  if (!matchUp || matchUp.collectionId) return undefined;
  // nothing to flip unless a decided result is being replaced by another decided result
  if (!matchUp.winningSide || !winningSide) return undefined;
  // a winner CHANGE is `CANNOT_CHANGE_WINNING_SIDE`'s question, not this one
  if (winningSide !== matchUp.winningSide) return undefined;

  const feedLink = (drawDefinition?.links ?? []).find(
    (link: any) =>
      link?.linkType === LOSER &&
      link?.linkCondition === FIRST_MATCHUP &&
      link?.source?.structureId === structure?.structureId,
  );
  if (!feedLink) return undefined;

  // Only rounds BEFORE the feeding round contribute prior wins. The feeding round itself decides who
  // the loser IS, which is a different question and a different guard.
  const feedingRoundNumber = (feedLink as any).source?.roundNumber;
  if (!feedingRoundNumber || (matchUp.roundNumber ?? 0) >= feedingRoundNumber) return undefined;

  const winnerDrawPosition = matchUp.drawPositions?.[matchUp.winningSide - 1];
  if (typeof winnerDrawPosition !== 'number') return undefined;

  const structureMatchUps = (inContextDrawMatchUps ?? []).filter(
    (candidate: any) => candidate.structureId === structure?.structureId && !candidate.collectionId,
  );

  // Does a feed decision involving this participant even exist yet? It does only when the feeding
  // round matchUp they reached has been decided AND they are its loser — a participant who won it
  // never fed, and one whose matchUp is undecided has nothing to un-decide.
  const feedingMatchUp = structureMatchUps.find(
    (candidate: any) =>
      candidate.roundNumber === feedingRoundNumber && candidate.drawPositions?.includes(winnerDrawPosition),
  );
  if (!feedingMatchUp?.winningSide) return undefined;
  const feedingWinnerDrawPosition = feedingMatchUp.drawPositions?.[feedingMatchUp.winningSide - 1];
  if (feedingWinnerDrawPosition === winnerDrawPosition) return undefined;

  /**
   * Eligibility turns on a COUNT, so a flip in this matchUp only matters when nothing else already
   * decides it. With another scored win in hand the participant is ineligible either way, and the
   * correction changes nothing downstream.
   */
  const priorRoundMatchUps = structureMatchUps.filter(
    (candidate: any) => (candidate.roundNumber ?? 0) < feedingRoundNumber,
  );
  const otherWins = getDrawPositionWinCount({
    sourceMatchUps: priorRoundMatchUps.filter((candidate: any) => candidate.matchUpId !== matchUp.matchUpId) as any,
    drawPosition: winnerDrawPosition,
  });
  if (otherWins > 0) return undefined;

  /**
   * Evaluated on the RESULTING RECORD, not on the request.
   *
   * `matchUpStatus` is frequently omitted — it is the ordinary shape of a score entry — and the
   * engine then writes `COMPLETED`. Reading `params.matchUpStatus ?? matchUp.matchUpStatus` instead
   * evaluates the status being REPLACED, which an adversarial review caught answering two different
   * ways for the identical operation: `{winningSide, score}` allowed, and the same call with
   * `matchUpStatus: COMPLETED` spelled out refused. Score falls back the same way the engine
   * retains it on a status-only write.
   */
  const wasUnscored = isUnscoredOutcome({ matchUpStatus: matchUp.matchUpStatus, score: matchUp.score });
  const willBeUnscored = isUnscoredOutcome({
    matchUpStatus: matchUpStatus ?? COMPLETED,
    score: score ?? matchUp.score,
  });
  if (wasUnscored === willBeUnscored) return undefined;

  return { participantDrawPosition: winnerDrawPosition, sourceRoundMatchUpId: feedingMatchUp.matchUpId };
}
