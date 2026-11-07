import { checkSetIsComplete, getLeadingSide } from '@Helpers/matchUpFormatCode/setRules/setCompletion';
import { isTiebreakGamesScore } from '@Helpers/matchUpFormatCode/setRules/tiebreakAtRules';

// types
import type { SetFormatStructure } from '@Types/scoring/types';
import type { Set as SetType } from '@Types/tournamentTypes';

export function getWinningSide({ analysis, set }) {
  const leadingSide = getLeadingSide({ set });
  const { isDecidingSet, isTiebreakSet, matchUpScoringFormat } = analysis;

  // This helper types a score key by key, and opens `7-6(` the moment the games call for a tiebreak: here a
  // tiebreak games score with no points is a set whose points are BEING typed, finished when its closer is. The
  // engine records a bare `7-6` (ruling V11) and, since 7.33.0, `checkSetIsComplete` calls it complete — the
  // right answer for a score that arrives whole, and the wrong one for a keystroke in the middle of a tiebreak.
  const setFormat =
    isDecidingSet && matchUpScoringFormat?.finalSetFormat
      ? matchUpScoringFormat.finalSetFormat
      : matchUpScoringFormat?.setFormat;
  if (!isTiebreakSet && tiebreakEntryOpen(set, setFormat)) return undefined;

  const setIsComplete = checkSetIsComplete({
    matchUpScoringFormat,
    isDecidingSet,
    isTiebreakSet,
    set,
  });
  return setIsComplete && leadingSide;
}

/** The games are the tiebreak games score the format produces, and neither side's points are in yet. */
function tiebreakEntryOpen(set: SetType | undefined, setFormat: SetFormatStructure | undefined): boolean {
  const { setTo, tiebreakFormat, noTiebreak } = setFormat ?? {};
  const tiebreakAt = typeof setFormat?.tiebreakAt === 'number' ? setFormat.tiebreakAt : undefined;
  const formatHasTiebreak = !noTiebreak && (!!tiebreakFormat || tiebreakAt !== undefined);
  if (!formatHasTiebreak || typeof set?.side1Score !== 'number' || typeof set?.side2Score !== 'number') return false;
  const hasPoints = typeof set.side1TiebreakScore === 'number' || typeof set.side2TiebreakScore === 'number';
  if (hasPoints) return false;
  const high = Math.max(set.side1Score, set.side2Score);
  const low = Math.min(set.side1Score, set.side2Score);
  return isTiebreakGamesScore(high, low, { setTo, tiebreakAt: tiebreakAt ?? setTo });
}
