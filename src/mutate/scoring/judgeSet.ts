/**
 * judgeSet - how a set's rule reads a total, and the facts a game, a set total, a segment end and a
 * late-start baseline must carry
 *
 * Scoring-engine spec § 2.2–2.5 (CA 2026-10-18). A total is judged by the rule of the segment it is
 * entered for: a total the rule calls finished gets the rule's winner, an explicit `winningSide` that
 * contradicts the rule is refused, an explicit `winningSide` for the side ahead on an unfinished total is a
 * set-level mercy or manual end, and an unfinished total with no winner is the set in play.
 */

import { isLiveDecidingSet } from '@Tools/scoring/scoringUtilities';
import { checkStandardSetWon } from './addPoint';
import { checkTiebreakWon } from './gameWon';
import { isObject } from '@Tools/objects';

// types
import type { FormatStructure, SetFormatStructure, SetScore, TiebreakFormatStructure } from '@Types/scoring/types';

/** A set total as a set entry or a baseline gives it. */
export type SetTotal = {
  side1Score: number;
  side2Score: number;
  side1TiebreakScore?: number;
  side2TiebreakScore?: number;
  winningSide?: number;
};

export type SetJudgement = {
  /** The rule calls the total finished: won, or a timed segment closed level. */
  finished: boolean;
  /** The winner the rule gives a finished total. */
  winningSide?: 1 | 2;
  /** The side ahead on the units the segment counts (games, points, runs). */
  ahead?: 1 | 2;
  /** A level timed total whose declared tiebreak at time is still to be played (§ 6.4 rule 2). */
  tiebreakAtTime?: boolean;
  /** Why the total cannot be what it claims: a 1-0 tiebreak-only set whose points do not win it. */
  inconsistent?: string;
};

/** A set that is closed: won, or a timed segment ended with or without a winner. */
export type ClosableSet = SetScore & { segmentComplete?: boolean };

function sideAhead(side1: number, side2: number): 1 | 2 | undefined {
  if (side1 === side2) return undefined;
  return side1 > side2 ? 1 : 2;
}

const isCount = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;
const given = (value: unknown): boolean => value !== undefined && value !== null;

/**
 * The format governing set `setNumber`, read from the score of the sets before it (spec § 3.2): the
 * final-set format in the deciding set, the ordinary one otherwise.
 */
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

/** A tiebreak-only total (§ 5): read from its tiebreak points, or from its scores taken as points. */
function judgeTiebreakOnly(total: SetTotal, tiebreakSet: TiebreakFormatStructure): SetJudgement {
  const tiebreakTo = tiebreakSet.tiebreakTo || 11;
  const { side1Score: s1, side2Score: s2, side1TiebreakScore: t1, side2TiebreakScore: t2 } = total;
  const hasPoints = given(t1) && given(t2);
  const oneGame = (s1 === 1 && s2 === 0) || (s1 === 0 && s2 === 1);
  if (oneGame && !hasPoints) {
    const winningSide = s1 > s2 ? 1 : 2;
    return { finished: true, winningSide, ahead: winningSide };
  }
  const [p1, p2] = hasPoints ? [t1!, t2!] : [s1, s2];
  const won = checkTiebreakWon(p1, p2, tiebreakTo, tiebreakSet.NoAD);
  const winningSide = won === undefined ? undefined : ((won + 1) as 1 | 2);
  const judgement: SetJudgement = { finished: winningSide !== undefined, winningSide, ahead: sideAhead(p1, p2) };
  if (oneGame && winningSide !== (s1 > s2 ? 1 : 2))
    judgement.inconsistent = `A tiebreak-only set of ${s1}-${s2} is not won by points of ${p1}-${p2} in a race to ${tiebreakTo}`;
  return judgement;
}

/** A timed total is a finished segment (§ 2.3 rule 4): the side with more wins, a level one follows § 6.4. */
function judgeTimed(total: SetTotal, setFormat: SetFormatStructure): SetJudgement {
  const { side1Score: s1, side2Score: s2, side1TiebreakScore: t1, side2TiebreakScore: t2 } = total;
  const ahead = sideAhead(s1, s2);
  if (ahead) return { finished: true, winningSide: ahead, ahead };
  const tiebreak = setFormat.tiebreakFormat;
  if (!tiebreak) return { finished: true };
  // level, with a declared tiebreak at time: its points decide, or it is still to play
  if (given(t1) && given(t2)) {
    const won = checkTiebreakWon(t1!, t2!, tiebreak.tiebreakTo || 7, tiebreak.NoAD);
    if (won !== undefined) return { finished: true, winningSide: (won + 1) as 1 | 2, ahead: (won + 1) as 1 | 2 };
  }
  return { finished: false, tiebreakAtTime: true };
}

/** How the rule of `setFormat` reads a total (spec § 2.3). */
export function judgeSetTotal(total: SetTotal, setFormat: SetFormatStructure | undefined): SetJudgement {
  const { side1Score: s1, side2Score: s2 } = total;
  const ahead = sideAhead(s1, s2);
  // an inning total is a played inning: the side with more runs wins it, and a level one is closed level
  if (setFormat?.outs) return { finished: true, winningSide: ahead, ahead };
  if (!setFormat) return { finished: !!ahead, winningSide: ahead, ahead };
  if (setFormat.tiebreakSet) return judgeTiebreakOnly(total, setFormat.tiebreakSet);
  if (setFormat.timed) return judgeTimed(total, setFormat);
  const won = checkStandardSetWon(s1, s2, setFormat, false);
  if (won === undefined) return { finished: false, ahead };
  return { finished: true, winningSide: (won + 1) as 1 | 2, ahead };
}

/**
 * The winner a total is recorded with (spec § 2.3 rule 2), or why the rule refuses it: an explicit
 * `winningSide` naming the loser of a finished total, or a side that is not ahead.
 */
export function settleSetWinner(total: SetTotal, judgement: SetJudgement): { winningSide?: 1 | 2; refusal?: string } {
  const explicit = given(total.winningSide) ? (total.winningSide as 1 | 2) : undefined;
  if (judgement.inconsistent)
    return { winningSide: explicit ?? judgement.winningSide, refusal: judgement.inconsistent };
  if (explicit === undefined) return { winningSide: judgement.winningSide };
  const score = `${total.side1Score}-${total.side2Score}`;
  if (judgement.finished && judgement.winningSide !== explicit)
    return { winningSide: explicit, refusal: `winningSide ${explicit} contradicts the finished total ${score}` };
  if (!judgement.finished && judgement.ahead !== explicit)
    return { winningSide: explicit, refusal: `winningSide ${explicit} is not ahead at ${score}` };
  return { winningSide: explicit };
}

/**
 * Marks a set by the format governing it (§ 1.2, CA 2026-10-21): `isTiebreakOnly` where a tiebreak-only rule scores
 * it, a `-F:TB{n}` match tiebreak included, and `isTimed` where a timed one does, however the set was entered.
 */
export function markSet(set: SetScore, setFormat: SetFormatStructure | undefined): void {
  if (setFormat?.tiebreakSet && !setFormat.timed) set.isTiebreakOnly = true;
  if (setFormat?.timed) set.isTimed = true;
}

/** The set a judged total is recorded as. */
export function buildJudgedSet(
  total: SetTotal,
  setNumber: number,
  setFormat: SetFormatStructure | undefined,
  judgement: SetJudgement,
  winningSide: 1 | 2 | undefined,
): ClosableSet {
  const set: ClosableSet = { setNumber, side1Score: total.side1Score, side2Score: total.side2Score, winningSide };
  if (given(total.side1TiebreakScore)) set.side1TiebreakScore = total.side1TiebreakScore;
  if (given(total.side2TiebreakScore)) set.side2TiebreakScore = total.side2TiebreakScore;
  if (setFormat?.outs && judgement.finished) set.segmentComplete = true;
  markSet(set, setFormat);
  if (setFormat?.timed) {
    if (winningSide !== undefined || judgement.finished) set.segmentComplete = true;
    else if (judgement.tiebreakAtTime) {
      set.side1TiebreakScore ??= 0;
      set.side2TiebreakScore ??= 0;
    }
  }
  return set;
}

// ============================================================================
// The facts each action carries (spec § 2, CA 2026-10-18): refused before anything is written
// ============================================================================

/** Why a game's facts are refused (§ 2.2), if they are. */
export function gameInputRefusal(input: unknown): string | undefined {
  if (!isObject(input)) return 'A game needs its winner';
  const { winner, tiebreakScore } = input as Record<string, any>;
  if (winner !== 0 && winner !== 1) return `Invalid winner: ${winner}`;
  if (
    given(tiebreakScore) &&
    !(Array.isArray(tiebreakScore) && tiebreakScore.length === 2 && tiebreakScore.every(isCount))
  )
    return `Invalid tiebreakScore: ${JSON.stringify(tiebreakScore)}`;
  return undefined;
}

/** Why a set total's facts are refused (§ 2.3), if they are. */
export function setInputRefusal(input: unknown): string | undefined {
  if (!isObject(input)) return 'A set needs its scores';
  const options = input as Record<string, any>;
  for (const key of ['side1Score', 'side2Score']) if (!isCount(options[key])) return `Invalid ${key}: ${options[key]}`;
  for (const key of ['side1TiebreakScore', 'side2TiebreakScore'])
    if (given(options[key]) && !isCount(options[key])) return `Invalid ${key}: ${options[key]}`;
  if (given(options.winningSide) && options.winningSide !== 1 && options.winningSide !== 2)
    return `Invalid winningSide: ${options.winningSide}`;
  return undefined;
}

/** Why a segment end's facts are refused (§ 2.4), if they are. */
export function endSegmentInputRefusal(input: unknown): string | undefined {
  if (!given(input)) return undefined;
  if (typeof input !== 'object') return 'Invalid endSegment options';
  const { setNumber, reason } = input as Record<string, any>;
  if (given(setNumber) && !(Number.isInteger(setNumber) && (setNumber as number) > 0))
    return `Invalid setNumber: ${setNumber}`;
  if (given(reason) && typeof reason !== 'string') return `Invalid reason: ${reason}`;
  return undefined;
}

function pairRefusal(value: unknown, keys: [string, string], name: string): string | undefined {
  if (!given(value)) return undefined;
  const pair = value as Record<string, any>;
  if (!isObject(value) || !keys.every((key) => isCount(pair[key]))) return `Invalid ${name}: ${JSON.stringify(value)}`;
  return undefined;
}

/** Why a baseline's facts are refused (§ 2.5), if they are. */
export function baselineInputRefusal(input: unknown): string | undefined {
  const options = input as Record<string, any>;
  if (!isObject(input) || !Array.isArray(options.sets)) return 'A baseline needs its sets';
  for (const set of options.sets) {
    const refusal = setInputRefusal(set);
    if (refusal) return refusal;
  }
  const { currentSetScore, currentGameScore, server, winningSide, matchUpStatus } = options;
  const pairs =
    pairRefusal(currentSetScore, ['side1Score', 'side2Score'], 'currentSetScore') ??
    pairRefusal(currentGameScore, ['side1Points', 'side2Points'], 'currentGameScore');
  if (pairs) return pairs;
  if (given(server) && server !== 0 && server !== 1) return `Invalid server: ${server}`;
  if (given(winningSide) && winningSide !== 1 && winningSide !== 2) return `Invalid winningSide: ${winningSide}`;
  if (given(matchUpStatus) && typeof matchUpStatus !== 'string') return `Invalid matchUpStatus: ${matchUpStatus}`;
  return undefined;
}
