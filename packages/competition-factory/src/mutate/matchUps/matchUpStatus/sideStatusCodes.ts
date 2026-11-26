import { nonDirectingMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { isDoubleExit } from '@Validators/isExit';

// types and constants
import { MatchUp, MatchUpStatusUnion } from '@Types/tournamentTypes';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import {
  ABANDONED,
  CANCELLED,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  INCOMPLETE,
  RETIRED,
  WALKOVER,
} from '@Constants/matchUpStatusConstants';

/**
 * A SCORING REASON CODE BELONGS TO SOMETHING — a side, or the match. This module decides which.
 *
 * The policy offers a reason for seven statuses and they do not attribute alike:
 *
 *  - `DEFAULTED`, `WALKOVER`, `RETIRED` — and the `WITHDRAWN` label group, which is not a matchUpStatus
 *    at all but arrives as a walkover reason — are things a SIDE did. `{ 2: 'DM' }`, stored as
 *    `sideStatusCodes`. A double exit attributes BOTH sides.
 *  - `ABANDONED`, `CANCELLED`, `INCOMPLETE` are things that happened to the MATCH. Nobody won, so nobody
 *    is attributed: stored as `matchUpStatusCode`.
 *
 * The split is driven by `nonDirectingMatchUpStatuses`, the factory's own grouping, rather than a list
 * repeated here — the same constant components derives its `NON_DIRECTING_ENDINGS` from, so the two ends
 * of the wire cannot drift.
 *
 * Reasons are submitted keyed, as they are stored (`outcome.sideStatusCodes`, `outcome.matchUpStatusCode`),
 * and cleared only by an explicit `outcome.clearStatusCodes`. A write that submits no reason keeps the
 * reasons the matchUp holds that still describe the result it writes.
 */

const NON_DIRECTING = new Set<string>(nonDirectingMatchUpStatuses);

/** The statuses a reason can describe: every other status has no reason to keep. */
const REASON_STATUSES = new Set<string>([
  ABANDONED,
  CANCELLED,
  INCOMPLETE,
  DEFAULTED,
  RETIRED,
  WALKOVER,
  DOUBLE_WALKOVER,
  DOUBLE_DEFAULT,
]);

/** Whether a reason for this status attributes to a SIDE rather than to the match. */
export function reasonAttributesToSide(matchUpStatus?: MatchUpStatusUnion | string): boolean {
  return !!matchUpStatus && !NON_DIRECTING.has(matchUpStatus);
}

export type StatusReasons = { matchUpStatusCode?: string; sideStatusCodes?: Record<number, string> };

/**
 * What a call says about its matchUp's reasons, read once from the outcome at the input boundary.
 *
 * - `submitted`: the reasons the call gives, keyed as they are stored. They replace what the matchUp held.
 * - `clear`: `outcome.clearStatusCodes`, the explicit clear. Submitted reasons, if any, are written after it.
 * - neither: the matchUp keeps the reasons that still describe the result the call writes.
 */
export type StatusReasonsInput = { submitted?: StatusReasons; clear?: true };

/**
 * Read and check an outcome's keyed reasons. A positional `matchUpStatusCodes` array is no longer accepted;
 * `sideStatusCodes` is keyed by side (`1`, `2`), and every reason is a non-empty string.
 */
export function readStatusReasonsInput(outcome?: {
  matchUpStatusCodes?: unknown;
  matchUpStatusCode?: unknown;
  sideStatusCodes?: unknown;
  clearStatusCodes?: unknown;
}): { input?: StatusReasonsInput; error?: typeof INVALID_VALUES; info?: string } {
  if (!outcome || typeof outcome !== 'object') return {};
  if (outcome.matchUpStatusCodes !== undefined)
    return {
      error: INVALID_VALUES,
      info: 'outcome.matchUpStatusCodes is no longer accepted: submit sideStatusCodes or matchUpStatusCode',
    };
  const { matchUpStatusCode, sideStatusCodes, clearStatusCodes } = outcome;
  if (clearStatusCodes !== undefined && typeof clearStatusCodes !== 'boolean')
    return { error: INVALID_VALUES, info: 'outcome.clearStatusCodes must be a boolean' };
  if (matchUpStatusCode !== undefined && (typeof matchUpStatusCode !== 'string' || !matchUpStatusCode))
    return { error: INVALID_VALUES, info: 'outcome.matchUpStatusCode must be a non-empty string' };
  const submitted: StatusReasons = {};
  if (matchUpStatusCode) submitted.matchUpStatusCode = matchUpStatusCode;
  if (sideStatusCodes !== undefined) {
    if (!sideStatusCodes || typeof sideStatusCodes !== 'object' || Array.isArray(sideStatusCodes))
      return {
        error: INVALID_VALUES,
        info: 'outcome.sideStatusCodes must be keyed by side: { 1?: string, 2?: string }',
      };
    const keyed: Record<number, string> = {};
    for (const [side, code] of Object.entries(sideStatusCodes)) {
      if ((side !== '1' && side !== '2') || typeof code !== 'string' || !code)
        return {
          error: INVALID_VALUES,
          info: 'outcome.sideStatusCodes must be keyed by side: { 1?: string, 2?: string }',
        };
      keyed[Number(side)] = code;
    }
    if (Object.keys(keyed).length) submitted.sideStatusCodes = keyed;
  }
  const input: StatusReasonsInput = {};
  if (Object.keys(submitted).length) input.submitted = submitted;
  if (clearStatusCodes) input.clear = true;
  return { input };
}

/**
 * The reasons `reasons` holds that describe a result with this status and winner: the match-level reason
 * for a status that attributes to the match, the side reasons of the sides that exited for one that
 * attributes to a side (both sides of a double exit, the side that did not win a single exit).
 *
 * `gate`: a status that takes no reason keeps none (a result corrected to COMPLETED, or removed). The
 * engine's own propagation writes pass no gate, and keep the match-level reason a non-directing status
 * holds.
 */
function attributable(
  reasons: StatusReasons,
  matchUpStatus: MatchUpStatusUnion | string | undefined,
  winningSide: number | undefined,
  gate: boolean,
): StatusReasons {
  if (gate && !REASON_STATUSES.has(matchUpStatus as string)) return {};
  if (!reasonAttributesToSide(matchUpStatus))
    return reasons.matchUpStatusCode ? { matchUpStatusCode: reasons.matchUpStatusCode } : {};

  let exitingSides: number[] = [];
  if (isDoubleExit(matchUpStatus)) exitingSides = [1, 2];
  else if (winningSide) exitingSides = [3 - winningSide];
  const sideStatusCodes: Record<number, string> = {};
  for (const sideNumber of exitingSides) {
    const code = reasons.sideStatusCodes?.[sideNumber];
    if (code) sideStatusCodes[sideNumber] = code;
  }
  return Object.keys(sideStatusCodes).length ? { sideStatusCodes } : {};
}

/** Replace a matchUp's stored reasons. */
function storeReasons(matchUp: MatchUp, reasons: StatusReasons): void {
  if (reasons.matchUpStatusCode) matchUp.matchUpStatusCode = reasons.matchUpStatusCode;
  else delete matchUp.matchUpStatusCode;
  if (reasons.sideStatusCodes) matchUp.sideStatusCodes = reasons.sideStatusCodes;
  else delete matchUp.sideStatusCodes;
}

/**
 * A call's reasons for its own matchUp: what the call said (`input`), the reasons the matchUp held before the call
 * wrote anything (`prior`), and the matchUp they are for, so a params spread into a write on another matchUp cannot
 * carry them there. Built once per call (`callStatusReasons`).
 */
export type CallStatusReasons = { matchUpId: string; input: StatusReasonsInput; prior: StatusReasons };

export function callStatusReasons(matchUpId: string, input: StatusReasonsInput = {}, matchUp?: MatchUp) {
  const prior: StatusReasons = {};
  if (matchUp?.matchUpStatusCode) prior.matchUpStatusCode = matchUp.matchUpStatusCode;
  if (matchUp?.sideStatusCodes) prior.sideStatusCodes = { ...matchUp.sideStatusCodes };
  return { matchUpId, input, prior } satisfies CallStatusReasons;
}

/**
 * Write a call's reasons onto its own matchUp from the status and winner it now holds. Every write of the call's
 * matchUp applies it, and it reads the reasons as they were before the call, so a route that writes the matchUp
 * twice (taking a result back, then writing the new one) ends where a single write would.
 *
 * - submitted reasons replace what the matchUp held; one that does not describe the result (a side reason for the
 *   winner, a side reason on a status that attributes to the match) is not stored;
 * - the explicit clear removes them;
 * - otherwise the matchUp keeps the reasons it held that still describe the result: the status still takes a
 *   reason, and the side a reason names still exited.
 */
export function writeStatusReasons(matchUp: MatchUp, reasons: CallStatusReasons): void {
  const { matchUpStatus, winningSide } = matchUp;
  const { input, prior } = reasons;
  let source: StatusReasons = prior;
  if (input.submitted) source = input.submitted;
  else if (input.clear) source = {};
  storeReasons(matchUp, attributable(source, matchUpStatus, winningSide, true));
}

/**
 * Marks an ENGINE write that keeps the reasons its matchUp holds rather than taking any from the call. It
 * names the matchUp it describes, so a params object spread into a nested write on another matchUp cannot
 * carry it there. `sideStatusCodes`: real reasons the write attributes by side — the source's own keyed
 * reason a propagation carries with the arriving side.
 */
export type RetainedStatusCodes = { matchUpId: string; sideStatusCodes?: Record<number, string> };

/**
 * The reasons an ENGINE write keeps: those the matchUp already holds, plus any the write attributes explicitly
 * (`carried`: the source's own side-keyed reason a propagation brings with the arriving side), filtered by
 * the status and winner the write leaves.
 *
 * A propagation onto a matchUp that already holds a delivered double default must not turn a bare outcome
 * code into a side reason, which is why the reasons come only from real reasons and never from a display of
 * the status.
 *
 * WHO PASSES IT: every engine write whose status is a propagation or unwind, not a call — `progressExitStatus`,
 * the convergence reconcile and the forward writes in `doubleExitAdvancement`, and the unwinds in
 * `removeDoubleExit`.
 */
export function attributeRetainedStatusCodes({
  matchUpStatus,
  winningSide,
  carried,
  matchUp,
}: {
  matchUpStatus?: MatchUpStatusUnion | string;
  carried?: Record<number, string>;
  winningSide?: number;
  matchUp?: MatchUp;
}): StatusReasons {
  const reasons = {
    matchUpStatusCode: matchUp?.matchUpStatusCode,
    sideStatusCodes: { ...matchUp?.sideStatusCodes, ...carried },
  };
  return attributable(reasons, matchUpStatus, winningSide, false);
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
