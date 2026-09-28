import { nonDirectingMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { isDoubleExit } from '@Validators/isExit';

// types
import { MatchUp, MatchUpStatusUnion } from '@Types/tournamentTypes';

/**
 * A SCORING REASON CODE BELONGS TO SOMETHING — a side, or the match. This module decides which.
 *
 * The policy offers a reason for seven statuses and they do not attribute alike:
 *
 *  - `DEFAULTED`, `WALKOVER`, `RETIRED` — and the `WITHDRAWN` label group, which is not a matchUpStatus
 *    at all but arrives as a walkover reason — are things a SIDE did. `{ 2: 'DM' }`.
 *  - `ABANDONED`, `CANCELLED`, `INCOMPLETE` are things that happened to the MATCH. Nobody won, so nobody
 *    is attributed; components states it directly — they *"resolve nobody"*, and asking who won an
 *    abandoned match is the wrong question.
 *
 * The positional array could not express that difference. Its index is a side, so a match-level reason had
 * to be parked at index 0 and read as though side 1 had done something. Splitting the two by attribution
 * is what lets both be read without an index, which is the destination for this surface.
 *
 * The split is driven by `nonDirectingMatchUpStatuses`, the factory's own grouping, rather than a list
 * repeated here — the same constant components derives its `NON_DIRECTING_ENDINGS` from, so the two ends
 * of the wire cannot drift.
 */

const NON_DIRECTING = new Set(nonDirectingMatchUpStatuses.filter(Boolean) as string[]);

/** Whether a reason for this status attributes to a SIDE rather than to the match. */
export function reasonAttributesToSide(matchUpStatus?: MatchUpStatusUnion | string): boolean {
  return !!matchUpStatus && !NON_DIRECTING.has(matchUpStatus);
}

/**
 * Split a submitted `matchUpStatusCodes` array into the two fields that own its contents.
 *
 * The array arrives from a client positionally, which is the one place that shape is still the input
 * contract — a scoring dialog emits `['', 'DM']` meaning "side 2, misconduct". This reads it ONCE, at the
 * boundary, and everything downstream uses the keyed form.
 *
 * WHICH SIDE. For a single exit the reason belongs to the side that did NOT win; `winningSide` gives that
 * directly and does not depend on the array's own indices being right. For a DOUBLE exit both sides
 * exited, so a submitted pair attributes per index — that is the one case where the array's position is
 * genuinely the attribution, and it is also the case where both slots carry the same code in every stored
 * record measured.
 *
 * A submitted array is trusted for its VALUES, not for its positions: a single-element `['DM']` with
 * `winningSide: 1` means side 2 defaulted for reason DM, whatever index the client used.
 */
export function splitStatusCodes({
  matchUpStatusCodes,
  matchUpStatus,
  winningSide,
}: {
  matchUpStatusCodes?: (string | number | undefined | null)[];
  matchUpStatus?: MatchUpStatusUnion | string;
  winningSide?: number;
}): { matchUpStatusCode?: string; sideStatusCodes?: Record<number, string> } {
  const codes = (matchUpStatusCodes ?? []).map((code) => (typeof code === 'string' ? code : undefined));
  const present = codes.filter((code): code is string => !!code);
  if (!present.length) return {};

  if (!reasonAttributesToSide(matchUpStatus)) return { matchUpStatusCode: present[0] };

  if (isDoubleExit(matchUpStatus)) {
    const sideStatusCodes: Record<number, string> = {};
    for (const sideNumber of [1, 2] as const) {
      // both sides exited, so each slot attributes to its own side; a single submitted code covers both,
      // which is how every stored double exit records it (`['WOWO', 'WOWO']`)
      const code = codes[sideNumber - 1] ?? (present.length === 1 ? present[0] : undefined);
      if (code) sideStatusCodes[sideNumber] = code;
    }
    return Object.keys(sideStatusCodes).length ? { sideStatusCodes } : {};
  }

  // a single exit: the reason belongs to the side that did not win, read from `winningSide` rather than
  // from where the client happened to put it
  const exitingSide = winningSide ? 3 - winningSide : undefined;
  if (!exitingSide) return {};
  const code = codes[exitingSide - 1] ?? present[0];
  return code ? { sideStatusCodes: { [exitingSide]: code } } : {};
}

/** The reason code a side carries, if any. Keyed, never positional. */
export function getSideStatusCode({
  sideNumber,
  matchUp,
}: {
  sideNumber?: number;
  matchUp?: MatchUp;
}): string | undefined {
  if (sideNumber !== 1 && sideNumber !== 2) return undefined;
  return matchUp?.sideStatusCodes?.[sideNumber];
}
