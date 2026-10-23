/**
 * judgeSet - the set format that governs a set.
 *
 * The rest of this module, how a set's rule reads a total and the facts a game, a set total, a segment end and a
 * late-start baseline must carry, was v1's: the ScoringEngine's reducer holds those rules since SE4 (`v2/`).
 */

import { isLiveDecidingSet } from '@Tools/scoring/scoringUtilities';

// types
import type { FormatStructure, SetFormatStructure, SetScore } from '@Types/scoring/types';

/** The format governing set `setNumber`: the final set's when it is the live decider, otherwise the set format. */
export function setFormatFor(
  formatStructure: FormatStructure | undefined,
  sets: SetScore[],
  setNumber: number,
): SetFormatStructure | undefined {
  if (!formatStructure) return undefined;
  const setsWon: [number, number] = [0, 0];
  for (const set of sets.slice(0, setNumber - 1)) {
    if (set.winningSide === 1) setsWon[0]++;
    if (set.winningSide === 2) setsWon[1]++;
  }
  const isDecidingSet = isLiveDecidingSet(formatStructure, setsWon, setNumber);
  return isDecidingSet && formatStructure.finalSetFormat ? formatStructure.finalSetFormat : formatStructure.setFormat;
}
