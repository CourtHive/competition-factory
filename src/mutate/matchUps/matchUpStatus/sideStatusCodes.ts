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

const NON_DIRECTING = new Set<string>(nonDirectingMatchUpStatuses);

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

/**
 * Marks an ENGINE write whose `matchUpStatusCodes` were derived for display. It names the matchUp it
 * describes, so a params object spread into a nested write on another matchUp cannot carry it there.
 * `sideStatusCodes`: real reasons the write attributes by side — the source's own keyed reason a
 * propagation carries with the arriving side.
 */
export type DerivedStatusCodes = { matchUpId: string; sideStatusCodes?: Record<number, string> };

/**
 * The reasons an ENGINE write keeps, when the `matchUpStatusCodes` it stores were DERIVED, not submitted.
 *
 * `deriveStatusCodes` builds the positional array from provenance for display, and where a side exited with
 * no recorded reason it fills that side with the bare outcome code: `['', 'DEF']`, `['WO']`. That is a
 * display of the status, not a reason anybody gave. {@link splitStatusCodes} cannot tell the two apart and
 * must not try — a client's `['WO']` is its own input, and no code is reserved by value. So the decision is
 * made by ORIGIN: an engine write that derived its array says so, and its reasons come only from real
 * reasons — those the matchUp already retains, plus any the write attributes explicitly (`carried`: the
 * source's own side-keyed reason a propagation brings with the arriving side).
 *
 * Census A1 residue F1b, 2026-10-18. Routed through the split, a propagation onto a matchUp that already held
 * a delivered double default stored `{ 1: 'DEF', 2: 'DEF' }` — one bare code covering both sides of a double
 * exit — while the same results entered in the other order stored nothing; four pinned census schedules
 * failed do-undo on exactly this field.
 *
 * WHO PASSES IT: every engine write whose array is not client input — `progressExitStatus`, the convergence
 * reconcile and the forward writes in `doubleExitAdvancement` (which re-store the target's own array through
 * `retainPolicyCodes`, and that array may itself be an earlier derived display), and the unwinds in
 * `removeDoubleExit`. The forward writes were found by tracing: marking only the two derived writers left
 * `handleEmptyExitLoser` re-splitting a stored `['', 'DEF']` into `{ 2: 'DEF' }`.
 *
 * WHICH SIDES KEEP ONE is the same rule the split applies: both sides of a double exit, the side that did not
 * win a single exit, and nobody for a status that attributes to the match — whose own `matchUpStatusCode` is
 * retained as it stands.
 */
export function attributeDerivedStatusCodes({
  matchUpStatus,
  winningSide,
  carried,
  matchUp,
}: {
  matchUpStatus?: MatchUpStatusUnion | string;
  carried?: Record<number, string>;
  winningSide?: number;
  matchUp?: MatchUp;
}): { matchUpStatusCode?: string; sideStatusCodes?: Record<number, string> } {
  if (!reasonAttributesToSide(matchUpStatus)) {
    return matchUp?.matchUpStatusCode ? { matchUpStatusCode: matchUp.matchUpStatusCode } : {};
  }

  const reasons = { ...matchUp?.sideStatusCodes, ...carried };
  let exitingSides: number[] = [];
  if (isDoubleExit(matchUpStatus)) exitingSides = [1, 2];
  else if (winningSide) exitingSides = [3 - winningSide];
  const sideStatusCodes: Record<number, string> = {};
  for (const sideNumber of exitingSides) {
    const code = reasons[sideNumber];
    if (code) sideStatusCodes[sideNumber] = code;
  }
  return Object.keys(sideStatusCodes).length ? { sideStatusCodes } : {};
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
