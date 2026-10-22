import { INVALID_VALUES } from '@Constants/errorConditionConstants';

// constants and types
import type { EntryData, Pair, Refusal, Side } from './types';

/**
 * The closed, versioned action set (§ 2). A later action (a Rule 27 correction event, a new annotation) is
 * additive: it bumps the version and adds a type, and every timeline written under an earlier version still reads.
 */
export const ACTION_SET_VERSION = 1;

export const POINT = 'point';
export const GAME = 'game';
export const SET = 'set';
export const END_SEGMENT = 'endSegment';
export const SET_INITIAL_SCORE = 'setInitialScore';
export const SET_SERVER = 'setServer';
export const SUBSTITUTION = 'substitution';
export const CHALLENGE = 'challenge';
export const ANNOTATION = 'annotation';

export const ACTION_TYPES = [
  POINT,
  GAME,
  SET,
  END_SEGMENT,
  SET_INITIAL_SCORE,
  SET_SERVER,
  SUBSTITUTION,
  CHALLENGE,
  ANNOTATION,
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

/** the inputs that score: a second baseline is refused once any is on the timeline (§ 2.5) */
export const SCORING_INPUTS: ReadonlySet<string> = new Set([POINT, GAME, SET]);

/** the actions refused when the format does not parse: every action that scores or names a server (§ 1.1, § 2) */
export const NEEDS_A_FORMAT: ReadonlySet<string> = new Set([
  POINT,
  GAME,
  SET,
  END_SEGMENT,
  SET_INITIAL_SCORE,
  SET_SERVER,
]);

/**
 * R2 (§ 1.4): the point fields the engine calculates. Passed in, each is overwritten on the point and left out of
 * the timeline. `winningSide` and `serverSideNumber` are inputs when the caller supplied them, so they are not here.
 */
export const CALCULATED_POINT_FIELDS: ReadonlySet<string> = new Set([
  'pointNumber',
  'index',
  'set',
  'game',
  'number',
  'score',
  'pointsToGame',
  'pointsToSet',
  'pointsToMatch',
  'gamesToSet',
  'isBreakpoint',
  'serveSide',
]);

export function refusal(message: string): Refusal {
  return { code: INVALID_VALUES.code, message };
}

const isNonNegativeInteger = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

/**
 * One side named in either spelling (§ 1.3): `zeroBased` 0 or 1, `oneBased` 1 or 2, both naming the same side when
 * both are given. Returns the side, nothing when neither is given, or the refusal.
 */
export function readSide(
  zeroBased: unknown,
  oneBased: unknown,
  [zeroName, oneName]: [string, string],
): { side?: Side; refused?: Refusal } {
  if (zeroBased !== undefined && zeroBased !== 0 && zeroBased !== 1)
    return { refused: refusal(`Invalid ${zeroName}: ${String(zeroBased)}`) };
  if (oneBased !== undefined && oneBased !== 1 && oneBased !== 2)
    return { refused: refusal(`Invalid ${oneName}: ${String(oneBased)}`) };
  const fromOne = oneBased === undefined ? undefined : ((oneBased - 1) as Side);
  if (zeroBased !== undefined && fromOne !== undefined && zeroBased !== fromOne)
    return { refused: refusal(`${zeroName} ${String(zeroBased)} and ${oneName} ${String(oneBased)} disagree`) };
  return { side: (zeroBased as Side | undefined) ?? fromOne };
}

/** the facts of a `point` (§ 2.1, refusals 2-5); the winner, when one is named */
export function readPoint(data: EntryData | undefined): { winner?: Side; server?: Side; refused?: Refusal } {
  const winner = readSide(data?.winner, data?.winningSide, ['winner', 'winningSide']);
  if (winner.refused) return winner;
  const server = readSide(data?.server, data?.serverSideNumber, ['server', 'serverSideNumber']);
  if (server.refused) return server;
  const value = data?.scoreValue;
  if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0))
    return { refused: refusal(`Invalid scoreValue: ${String(value)}`) };
  const observed = data?.observedServeSide;
  if (observed !== undefined && observed !== 'deuce' && observed !== 'ad')
    return { refused: refusal(`Invalid observedServeSide: ${String(observed)}`) };
  return { winner: winner.side, server: server.side };
}

/** the facts of a `game` (§ 2.2): `winner` 0 or 1, a `tiebreakScore` two non-negative integers */
export function readGame(data: EntryData | undefined): { winner?: Side; tiebreakScore?: Pair; refused?: Refusal } {
  const winner = data?.winner;
  if (winner !== 0 && winner !== 1) return { refused: refusal(`Invalid winner: ${String(winner)}`) };
  const tiebreakScore = data?.tiebreakScore;
  if (tiebreakScore === undefined) return { winner };
  const valid = Array.isArray(tiebreakScore) && tiebreakScore.length === 2 && tiebreakScore.every(isNonNegativeInteger);
  if (!valid) return { refused: refusal('a tiebreakScore is two non-negative integers') };
  return { winner, tiebreakScore: [tiebreakScore[0], tiebreakScore[1]] };
}

export type SetTotal = { totals: Pair; tiebreakPoints?: Pair; winningSide?: 1 | 2 };

/** the facts of a set total (§ 2.3), as `addSet` and each baseline set give it */
export function readSetTotal(data: EntryData | undefined): { total?: SetTotal; refused?: Refusal } {
  const { side1Score, side2Score, side1TiebreakScore, side2TiebreakScore, winningSide } = data ?? {};
  if (!isNonNegativeInteger(side1Score) || !isNonNegativeInteger(side2Score))
    return { refused: refusal('a set total is two non-negative integers') };
  const tiebreakGiven = side1TiebreakScore !== undefined || side2TiebreakScore !== undefined;
  const given = tiebreakGiven ? [side1TiebreakScore ?? 0, side2TiebreakScore ?? 0] : undefined;
  if (given && !given.every(isNonNegativeInteger))
    return { refused: refusal('tiebreak scores are non-negative integers') };
  const tiebreakPoints = given as Pair | undefined;
  if (winningSide !== undefined && winningSide !== 1 && winningSide !== 2)
    return { refused: refusal(`Invalid winningSide: ${String(winningSide)}`) };
  return { total: { totals: [side1Score, side2Score], tiebreakPoints, winningSide } };
}

/** `endSegment` (§ 2.4): a `setNumber` that is a positive integer, a `reason` that is a string, when given */
export function readEndSegment(data: EntryData | undefined): Refusal | undefined {
  const { setNumber, reason } = data ?? {};
  if (setNumber !== undefined && !(Number.isInteger(setNumber) && (setNumber as number) > 0))
    return refusal(`Invalid setNumber: ${String(setNumber)}`);
  if (reason !== undefined && typeof reason !== 'string') return refusal(`Invalid reason: ${String(reason)}`);
  return undefined;
}

/** `setServer`: a side 0 or 1 (§ 2.6) */
export function readServer(data: EntryData | undefined): Refusal | undefined {
  const side = data?.side;
  return side === 0 || side === 1 ? undefined : refusal(`Invalid server side: ${String(side)}`);
}

/** `challenge`: a `sideNumber` 1 or 2 (§ 2.8) */
export function readChallenge(data: EntryData | undefined): Refusal | undefined {
  const sideNumber = data?.sideNumber;
  return sideNumber === 1 || sideNumber === 2
    ? undefined
    : refusal(`Invalid challenge sideNumber: ${String(sideNumber)}`);
}

/** a point's recorded facts: every field the caller supplied except the calculated ones (§ 1.4, § 12.2) */
export function pointFacts(data: EntryData | undefined): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data ?? {}).filter(([key]) => !CALCULATED_POINT_FIELDS.has(key)));
}
