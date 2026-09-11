// Format Converter Module

import type { FormatStructure, SetFormatStructure, GameFormatStructure } from '@Types/scoring/types';
import { stringify } from '@Helpers/matchUpFormatCode/stringify';
import { parse } from '@Helpers/matchUpFormatCode/parse';

/**
 * Validate a format code (either type)
 *
 * @param code - Format code to validate
 * @returns true if valid
 */
export function isValidFormat(code: string): boolean {
  return parse(code) !== undefined;
}

/**
 * Extract format properties from parsed Factory format
 * Maps Factory structure to UMO-compatible properties
 *
 * @param parsedFormat - Parsed format from Factory
 * @returns Object with UMO-compatible properties
 */
export function extractFormatProperties(parsedFormat: any) {
  const { bestOf, exactly, setFormat, finalSetFormat } = parsedFormat;

  return {
    // Match level
    bestOf,
    exactly,

    // Set level
    setThreshold: setFormat?.setTo,
    setMinDiff: setFormat?.noTiebreak ? (setFormat.winBy ?? 2) : 0,
    setHasDecider: !!setFormat?.tiebreakFormat || !!setFormat?.tiebreakSet,
    setWinBy: setFormat?.winBy,

    // Tiebreak level
    tiebreakAt: setFormat?.tiebreakAt || setFormat?.setTo,
    tiebreakTo: setFormat?.tiebreakFormat?.tiebreakTo || setFormat?.tiebreakSet?.tiebreakTo,
    tiebreakSet: setFormat?.tiebreakSet,
    noTiebreak: setFormat?.noTiebreak,

    // Scoring options
    noAd: setFormat?.NoAD || false,

    // Timed sets
    timed: setFormat?.timed || false,
    minutes: setFormat?.minutes,
    based: setFormat?.based,

    // Final set differences
    finalSetDiffers: !!finalSetFormat,
    finalSetThreshold: finalSetFormat?.setTo,
    finalSetTiebreakAt: finalSetFormat?.tiebreakAt,
    finalSetTiebreakTo: finalSetFormat?.tiebreakFormat?.tiebreakTo || finalSetFormat?.tiebreakSet?.tiebreakTo,
    finalSetNoTiebreak: finalSetFormat?.noTiebreak,
    finalSetWinBy: finalSetFormat?.winBy,
  };
}

/**
 * Get format description from code
 *
 * @param code - Format code
 * @returns Human-readable description
 */
export function getFormatDescription(code: string): string | undefined {
  const parsed = parse(code);
  if (parsed) {
    const props = extractFormatProperties(parsed);

    let desc = '';
    if (props.bestOf) {
      desc += `Best of ${props.bestOf} sets, `;
    } else if (props.exactly) {
      desc += `Exactly ${props.exactly} sets, `;
    }

    if (props.noAd) {
      desc += 'No-Ad, ';
    } else {
      desc += 'Advantage, ';
    }

    desc += `${props.setThreshold} games for set`;

    if (props.tiebreakTo) {
      desc += `, Tiebreak to ${props.tiebreakTo}`;
    }

    if (props.finalSetDiffers) {
      desc += ', final set ';
      if (props.finalSetNoTiebreak) {
        const finalWinBy = props.finalSetWinBy ?? 2;
        desc += `by ${finalWinBy} game${finalWinBy === 1 ? '' : 's'}`;
      } else if (props.finalSetTiebreakTo) {
        desc += `tiebreak to ${props.finalSetTiebreakTo}`;
      }
    }

    return desc;
  }

  return undefined;
}

/**
 * Compare two format codes for equivalence
 *
 * @param code1 - First format code
 * @param code2 - Second format code
 * @returns true if formats are equivalent
 */
export function areFormatsEquivalent(code1: string, code2: string): boolean {
  const parsed1 = parse(code1);
  const parsed2 = parse(code2);

  if (!parsed1 || !parsed2) {
    return false;
  }

  return stringify(parsed1) === stringify(parsed2);
}

// ============================================================================
// Scoring Inference Functions
// ============================================================================

/**
 * Check if a parsed format uses aggregate scoring
 *
 * Aggregate is signaled by:
 * parsed.aggregate === true (match-level A: SET7XA, HAL2A)
 */
export function isAggregateFormat(parsed: FormatStructure | undefined | null): boolean {
  if (!parsed) return false;
  return !!parsed.aggregate;
}

/**
 * Determine the set type for a given set index based on the format
 */
export type SetType = 'standard' | 'tiebreakOnly' | 'timed' | 'matchTiebreak';

export function resolveSetType(formatStructure: FormatStructure, setsWon: [number, number]): SetType {
  const bestOf = formatStructure.bestOf || formatStructure.exactly || 3;
  const setsToWin = Math.ceil(bestOf / 2);
  const isDecidingSet = setsWon[0] === setsToWin - 1 && setsWon[1] === setsToWin - 1;

  if (isDecidingSet && formatStructure.finalSetFormat) {
    const ff = formatStructure.finalSetFormat;
    if (ff.tiebreakSet) return 'matchTiebreak';
    if (ff.timed) return 'timed';
    return 'standard';
  }

  const sf = formatStructure.setFormat;
  if (!sf) return 'standard';

  if (sf.tiebreakSet) return 'tiebreakOnly';
  if (sf.timed) return 'timed';
  return 'standard';
}

/**
 * Calculate minimum points to win a game in the current context
 *
 * Returns undefined if not deterministic (timed sets)
 */
export function getPointsToGame(
  formatStructure: FormatStructure,
  context: { isDecidingSet: boolean; inTiebreak: boolean; isFinalSetTiebreak: boolean },
): number | undefined {
  const { isDecidingSet, inTiebreak, isFinalSetTiebreak } = context;
  const sf =
    isDecidingSet && formatStructure.finalSetFormat ? formatStructure.finalSetFormat : formatStructure.setFormat;

  if (sf?.timed) return undefined;

  if (isFinalSetTiebreak) {
    return formatStructure.finalSetFormat?.tiebreakSet?.tiebreakTo || 10;
  }

  if (inTiebreak) {
    return sf?.tiebreakFormat?.tiebreakTo || 7;
  }

  if (sf?.tiebreakSet) {
    return sf.tiebreakSet.tiebreakTo;
  }

  if (formatStructure.gameFormat?.type === 'CONSECUTIVE') {
    return formatStructure.gameFormat.count;
  }

  return 4;
}

/**
 * Calculate minimum points to complete a set from 0-0
 *
 * For standard tennis set to 6: 6 games × 4 points = 24 points
 * For tiebreak-only set to 11: 11 points
 * For timed sets: undefined (clock-based)
 */
export function getMinPointsToSetCompletion(
  setFormat: SetFormatStructure | undefined,
  gameFormat?: GameFormatStructure,
): number | undefined {
  if (!setFormat) return undefined;
  if (setFormat.timed) return undefined;

  if (setFormat.tiebreakSet) {
    return setFormat.tiebreakSet.tiebreakTo;
  }

  const setTo = setFormat.setTo || 6;
  const gamePointsTo = gameFormat?.type === 'CONSECUTIVE' ? gameFormat.count || 3 : 4;

  return setTo * gamePointsTo;
}

/**
 * Calculate minimum total points to complete an entire match from 0-0
 *
 * Returns undefined if any set is timed (no deterministic point count)
 */
export function getMinPointsToMatchCompletion(formatStructure: FormatStructure): number | undefined {
  const setPoints = getMinPointsToSetCompletion(formatStructure.setFormat, formatStructure.gameFormat);
  if (setPoints === undefined) return undefined;

  const setsNeeded = formatStructure.exactly ? formatStructure.exactly : Math.ceil((formatStructure.bestOf || 3) / 2);

  return setPoints * setsNeeded;
}

/**
 * Determine whether a format involves countable points
 * (vs timed segments where points are goals/baskets/etc.)
 */
export function hasCountablePoints(formatStructure: FormatStructure): boolean {
  if (formatStructure.setFormat?.timed) return false;
  if (formatStructure.simplified) return false;
  return true;
}
