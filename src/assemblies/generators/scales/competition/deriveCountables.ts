// Types
import type { MatchUp } from '@Types/tournamentTypes';

type DeriveCountablesResult = {
  side1Count: number;
  side2Count: number;
};

/**
 * Extracts countable scoring units from a matchUp in a format-agnostic way.
 * Tries points first, then games, then sets — uses whatever granularity is available.
 */
export function deriveCountables(matchUp: MatchUp): DeriveCountablesResult {
  const sets = matchUp.score?.sets ?? [];

  if (!sets.length) {
    return winningSideCountables(matchUp);
  }

  // Try games first (most granular commonly available)
  let side1Count = 0;
  let side2Count = 0;

  for (const set of sets) {
    const s1Games = set.side1Score ?? 0;
    const s2Games = set.side2Score ?? 0;

    // If tiebreak, include tiebreak points as a fractional game
    if (set.side1TiebreakScore !== undefined || set.side2TiebreakScore !== undefined) {
      const tb1 = set.side1TiebreakScore ?? 0;
      const tb2 = set.side2TiebreakScore ?? 0;
      const tbTotal = tb1 + tb2;
      // Count the tiebreak as a partial game based on point share
      if (tbTotal > 0) {
        side1Count += s1Games - (set.winningSide === 1 ? 1 : 0) + tb1 / tbTotal;
        side2Count += s2Games - (set.winningSide === 2 ? 1 : 0) + tb2 / tbTotal;
        continue;
      }
    }

    side1Count += s1Games;
    side2Count += s2Games;
  }

  // If we got game-level data, use it
  if (side1Count > 0 || side2Count > 0) {
    return { side1Count, side2Count };
  }

  // Fall back to set-level data
  return winningSideCountables(matchUp);
}

function winningSideCountables(matchUp: MatchUp): DeriveCountablesResult {
  const { winningSide } = matchUp;
  if (winningSide === 1) return { side1Count: 1, side2Count: 0 };
  if (winningSide === 2) return { side1Count: 0, side2Count: 1 };
  return { side1Count: 0, side2Count: 0 };
}
