import { INVALID_TIEBREAK_POINTS_DROPPED } from '@Constants/scoreWarningConstants';
import { finalSetGoverns } from '@Helpers/matchUpFormatCode/aggregateDecider';
import { isTiebreakGamesScore } from '@Query/matchUp/tiebreakAtRules';
import { validateSetScore } from '@Validators/validateMatchUpScore';
import { formatForSet } from '@Query/matchUp/tiebreakSetShape';
import { parse } from '@Helpers/matchUpFormatCode/parse';

// types
import type { ResultWarning } from '@Types/factoryTypes';
import type { Score } from '@Types/tournamentTypes';

type RepairScoreArgs = {
  matchUpFormat?: string;
  score: Score;
};

/**
 * The ingestion fallback for a score a results feed recorded impossibly — never for a live entry.
 *
 * CA, 2026-10-02 (ruling V12): a person entering a score is held to it — `7-6(10-7)` with a tiebreak to
 * seven is refused, because no tiebreak ends 10-7 — *"but if it's an ingestion pipeline perhaps we can
 * somehow relax and drop the invalid tiebreak points and fall back to 7-6"*. A `7-6` with no points is a
 * recordable set (ruling V11), so dropping points the format cannot produce keeps everything the feed
 * knew for certain: who won the set, and that it went to a tiebreak.
 *
 * Only that one repair, and only where it works: the games must be a tiebreak result, the points must be
 * refused, and the set without them must be accepted. Anything else is returned untouched for the write to
 * refuse. Each repaired set is named in an `INVALID_TIEBREAK_POINTS_DROPPED` warning, so a pipeline can
 * log what it changed. The caller then writes the returned score as usual.
 */
export function repairScore({ score, matchUpFormat }: RepairScoreArgs): { score: Score; warnings?: ResultWarning[] } {
  const parsed = matchUpFormat ? parse(matchUpFormat) : undefined;
  if (!parsed || !Array.isArray(score?.sets)) return { score };
  const maxSetNumber = parsed.bestOf ?? parsed.exactly;

  const setNumbers: number[] = [];
  const sets = score.sets.map((set: any, index: number) => {
    const setNumber = set?.setNumber ?? index + 1;
    const setFormat = formatForSet(parsed, setNumber);
    const { setTo, tiebreakAt } = setFormat ?? {};
    const [a, b] = [set?.side1Score, set?.side2Score];
    const hasPoints = [set?.side1TiebreakScore, set?.side2TiebreakScore].some((v) => v !== undefined && v !== null);
    if (!hasPoints || typeof a !== 'number' || typeof b !== 'number' || typeof tiebreakAt !== 'number') return set;
    if (!isTiebreakGamesScore(Math.max(a, b), Math.min(a, b), { setTo, tiebreakAt })) return set;

    const isDecidingSet = finalSetGoverns(parsed, setNumber, !!maxSetNumber && setNumber === maxSetNumber);
    if (validateSetScore(set, matchUpFormat, isDecidingSet, false).isValid) return set;

    const { side1TiebreakScore: _side1, side2TiebreakScore: _side2, ...withoutPoints } = set;
    if (!validateSetScore(withoutPoints, matchUpFormat, isDecidingSet, false).isValid) return set;

    setNumbers.push(setNumber);
    return withoutPoints;
  });

  if (!setNumbers.length) return { score };
  return { score: { ...score, sets }, warnings: [{ code: INVALID_TIEBREAK_POINTS_DROPPED, setNumbers }] };
}
