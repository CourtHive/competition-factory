import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { isDoubleExitStatus, requiresWinner } from './irregularEnding';

// constants and types
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';

/**
 * Reading a scoring policy's `matchUpStatusCodes` vocabulary, and the reason a matchUp recorded. Score entry offers a
 * policy's codes; it never invents them, and a status with no code group simply has no reason to choose.
 */

/** One entry of a policy's code group. The OBJECT form is canonical. */
export type StatusCodeEntry = {
  matchUpStatusCode: string;
  matchUpStatusCodeDisplay?: string;
  label?: string;
  description?: string;
};

/** A policy's groups, keyed by the matchUpStatus each refines. */
export type StatusCodeGroups = Record<string, StatusCodeEntry[]>;

/** The group a status reads its codes from: a double exit's codes are filed under its base ending. */
export function groupKeyForStatus(matchUpStatus: MatchUpStatusUnion | undefined): string | undefined {
  if (matchUpStatus === DOUBLE_WALKOVER) return WALKOVER;
  if (matchUpStatus === DOUBLE_DEFAULT) return DEFAULTED;
  return matchUpStatus;
}

/** The part of a stored matchUp a recorded reason is read from. */
export type RecordedReason = {
  matchUpStatus?: MatchUpStatusUnion;
  winningSide?: number;
  sideStatusCodes?: Record<number, unknown>;
  matchUpStatusCode?: unknown;
  matchUpStatusCodes?: unknown[];
};

/**
 * The reason code a matchUp recorded, for the control that has to re-display it.
 *
 * `matchUpStatusCodes` is POSITIONAL BY SIDE, so `[0]` is not the answer: a reason for side 2 sits at index 1. In
 * order: the side's own (`sideStatusCodes[side]`), the match's (`matchUpStatusCode`, for an ending that resolves
 * nobody), then `matchUpStatusCodes[0]` for records written before either field existed.
 */
export function recordedStatusCode(matchUp?: RecordedReason): string | undefined {
  const side = reasonSide(matchUp);
  const fromSide = side === undefined ? undefined : normalizeStatusCode(matchUp?.sideStatusCodes?.[side]);

  return (
    fromSide ?? normalizeStatusCode(matchUp?.matchUpStatusCode) ?? normalizeStatusCode(matchUp?.matchUpStatusCodes?.[0])
  );
}

/**
 * Which side's reason is shown: the side that did NOT win for a single exit, side 1 for a double exit (both carry
 * it), and none for an ending that resolves nobody.
 */
function reasonSide(matchUp?: { matchUpStatus?: MatchUpStatusUnion; winningSide?: number }): number | undefined {
  if (!requiresWinner(matchUp?.matchUpStatus)) return isDoubleExitStatus(matchUp?.matchUpStatus) ? 1 : undefined;
  if (matchUp?.winningSide !== 1 && matchUp?.winningSide !== 2) return undefined;

  return 3 - matchUp.winningSide;
}

/**
 * One element of a code group, or of a matchUp's `matchUpStatusCodes`, as its code string. Three shapes occur: a
 * string, a policy entry (`matchUpStatusCode`), and a `{ code }` wrapper the factory writes once propagation has
 * touched a matchUp. A provenance element carries no code and answers `undefined`.
 */
export function normalizeStatusCode(entry: unknown): string | undefined {
  if (typeof entry === 'string') return entry || undefined;
  if (!entry || typeof entry !== 'object') return undefined;

  const record = entry as Record<string, unknown>;
  const value = record.matchUpStatusCode ?? record.code;
  return typeof value === 'string' && value ? value : undefined;
}

/** The codes a policy offers for this status, or none; an entry without a code is dropped rather than offered blank. */
export function codesForStatus(
  groups: StatusCodeGroups | undefined,
  matchUpStatus: MatchUpStatusUnion | undefined,
): StatusCodeEntry[] {
  const key = groupKeyForStatus(matchUpStatus);
  if (!groups || !key) return [];

  const group = groups[key];
  if (!Array.isArray(group)) return [];

  return group.filter((entry) => !!normalizeStatusCode(entry));
}
