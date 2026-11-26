import { recordedStatusCode } from './statusCodes';
import {
  hydrateIrregularEnding,
  WINNER_REQUIRING_STATUSES,
  resolveIrregularEnding,
  NON_DIRECTING_ENDINGS,
  SELECTABLE_ENDINGS,
  supportsNeitherSide,
  carriesNoScore,
  NEITHER_SIDE,
} from './irregularEnding';

// constants and types
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import type { IrregularEndingResolution } from './irregularEnding';
import type { RecordedReason } from './statusCodes';
import type { SideNumber } from './types';

/**
 * The ENDING half of a score state: how a match ended, when it did not end on the score.
 *
 * An ending is chosen ON a side, which names the side the ending HAPPENED TO, so the winner is already known and no
 * separate winner question exists. The ten endings split exactly as the factory classifies them: three belong to a
 * side (Retired, Walkover, Defaulted), seven to the match. This module resolves nothing itself; it maps the choice
 * onto `resolveIrregularEnding`, so the forward walkover rule has one copy.
 *
 * Every transition returns a new object; every control is a toggle.
 */

export type ScoreEntryState = {
  /** The side that ended early, and how: the side it HAPPENED TO, not the winner. */
  sideEnding?: { sideNumber: SideNumber; status: string };
  /**
   * "…did not appear either — no one advances": turns a side ending into a double exit. A separate flag rather than
   * a third side value, because it is a different assertion, about the OTHER side.
   */
  bothSidesOut?: boolean;
  /** The match-level ending. One of the seven; mutually exclusive with `sideEnding`. */
  matchEnding?: string;
  /** The policy reason code chosen for whichever ending is selected. */
  reasonCode?: string;
};

/** What a score state's ending resolves to, plus the two things a resolution alone does not say. */
export type ScoreEntryResolution = IrregularEndingResolution & {
  /** True when the ending means a typed score is discarded rather than submitted. */
  clearsScore: boolean;
  /** True when an ending is in force at all. */
  hasEnding: boolean;
};

/** No ending chosen: a reachable state, not a null one. */
export const emptyScoreEntryState: ScoreEntryState = {};

/**
 * Record (or un-record) a per-side ending. Choosing the ending already selected on that side clears it, which is what
 * gives the score state a reachable empty state. A side ending clears a match ending and vice versa: both answer how
 * the match ended. `bothSidesOut` and `reasonCode` are qualifiers OF an ending and are dropped on any change of ending.
 */
export function chooseSideEnding(state: ScoreEntryState, sideNumber: SideNumber, status: string): ScoreEntryState {
  const current = state.sideEnding;
  if (current?.sideNumber === sideNumber && current.status === status) {
    return { ...state, sideEnding: undefined, bothSidesOut: undefined, reasonCode: undefined };
  }

  return {
    ...state,
    sideEnding: { sideNumber, status },
    matchEnding: undefined,
    bothSidesOut: undefined,
    reasonCode: undefined,
  };
}

/** Record (or un-record) a match-level ending. A toggle. */
export function chooseMatchEnding(state: ScoreEntryState, status: string): ScoreEntryState {
  if (state.matchEnding === status) {
    return { ...state, matchEnding: undefined, reasonCode: undefined };
  }

  return { ...state, matchEnding: status, sideEnding: undefined, bothSidesOut: undefined, reasonCode: undefined };
}

/**
 * Toggle "the other side did not appear either". Refused (the same state comes back) with no side ending to
 * qualify, and for an ending with no double form: RETIRED, since the factory has no double retirement.
 */
export function toggleBothSidesOut(state: ScoreEntryState): ScoreEntryState {
  if (!state.sideEnding || !supportsNeitherSide(state.sideEnding.status)) return state;
  return { ...state, bothSidesOut: !state.bothSidesOut };
}

/** Whether "did not appear either" may be offered at all. */
export function offersBothSidesOut(state: ScoreEntryState): boolean {
  return !!state.sideEnding && supportsNeitherSide(state.sideEnding.status);
}

/** Choose (or clear) a reason code for the selected ending. A toggle. */
export function chooseReasonCode(state: ScoreEntryState, code: string | undefined): ScoreEntryState {
  return { ...state, reasonCode: state.reasonCode === code ? undefined : code };
}

/**
 * The ending of a matchUp that ALREADY has an outcome (an existing outcome can be
 * opened). A stored matchUp names the WINNER; the score state records the side the ending happened to, so
 * hydration runs that mapping backwards. A double exit records `bothSidesOut` (its `sideNumber: 1` decides nothing); an
 * ending that resolves nobody is a match ending; a single exit is recorded against `3 - winningSide`; and a
 * winner-requiring status with no winning side is a corrupt record, refused with the empty state rather than a guessed
 * placement.
 */
export function hydrateScoreEntryState(matchUp?: RecordedReason): ScoreEntryState {
  const { selectedOutcome, winnerSelection } = hydrateIrregularEnding(matchUp);
  if (!SELECTABLE_ENDINGS.includes(selectedOutcome)) return emptyScoreEntryState;

  const reasonCode = recordedStatusCode(matchUp);

  if (winnerSelection === NEITHER_SIDE) {
    return { sideEnding: { sideNumber: 1, status: selectedOutcome }, bothSidesOut: true, reasonCode };
  }

  if (!WINNER_REQUIRING_STATUSES.has(selectedOutcome)) return { matchEnding: selectedOutcome, reasonCode };

  if (winnerSelection !== 1 && winnerSelection !== 2) return emptyScoreEntryState;

  return { sideEnding: { sideNumber: otherSide(winnerSelection), status: selectedOutcome }, reasonCode };
}

/** The status whose policy code group a reason comes from, or `undefined` with no ending chosen. */
export function reasonCodeStatus(state: ScoreEntryState): string | undefined {
  return state.sideEnding?.status ?? state.matchEnding;
}

/**
 * Resolve the ending into a submittable outcome. The one derivation here is the inversion: a side ending on side 1
 * means side 2 wins. Everything else is `resolveIrregularEnding`'s answer, fail-closed states included.
 */
export function resolveScoreEntry(state: ScoreEntryState): ScoreEntryResolution {
  const selectedOutcome = reasonCodeStatus(state);

  if (!selectedOutcome) {
    return { isValid: false, awaitingWinner: false, isDoubleExit: false, clearsScore: false, hasEnding: false };
  }

  let winnerSelection: 1 | 2 | typeof NEITHER_SIDE | undefined;
  if (state.sideEnding) winnerSelection = state.bothSidesOut ? NEITHER_SIDE : otherSide(state.sideEnding.sideNumber);

  const resolution = resolveIrregularEnding({ selectedOutcome, winnerSelection });

  // read from the RESOLVED status: `NO_SCORE_STATUSES` holds DOUBLE_WALKOVER, which nobody clicks
  return { ...resolution, clearsScore: carriesNoScore(resolution.matchUpStatus), hasEnding: true };
}

/**
 * A resolution for an ending a score REGION reported (Free Score parses `6-4 ret`) rather than one the operator
 * selected. A selected ending always wins; this applies only when nothing is selected.
 */
export function resolveReportedEnding(matchUpStatus?: MatchUpStatusUnion, winningSide?: number): ScoreEntryResolution {
  if (!matchUpStatus) {
    return { isValid: false, awaitingWinner: false, isDoubleExit: false, clearsScore: false, hasEnding: false };
  }

  const resolution = resolveIrregularEnding({
    selectedOutcome: matchUpStatus,
    // `undefined` stays undefined rather than becoming a side: the fail-closed direction
    winnerSelection: winningSide === 1 || winningSide === 2 ? winningSide : undefined,
  });

  return { ...resolution, clearsScore: carriesNoScore(resolution.matchUpStatus), hasEnding: true };
}

/** The side that wins when `sideNumber` is the one that ended early. */
function otherSide(sideNumber: SideNumber): SideNumber {
  return sideNumber === 1 ? 2 : 1;
}

/** The endings offered on a side, in `SELECTABLE_ENDINGS` order: the factory's directing statuses. */
export function sideEndingOptions(): string[] {
  return orderedEndings(WINNER_REQUIRING_STATUSES);
}

/** The endings offered for the match, in `SELECTABLE_ENDINGS` order: the factory's non-directing statuses. */
export function matchEndingOptions(): string[] {
  return orderedEndings(NON_DIRECTING_ENDINGS);
}

function orderedEndings(set: Set<string>): string[] {
  return SELECTABLE_ENDINGS.filter((status) => set.has(status));
}
