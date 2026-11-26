import {
  AWAITING_RESULT,
  ABANDONED,
  CANCELLED,
  COMPLETED,
  DEAD_RUBBER,
  DEFAULTED,
  DOUBLE_DEFAULT,
  DOUBLE_WALKOVER,
  INCOMPLETE,
  IN_PROGRESS,
  RETIRED,
  SUSPENDED,
  WALKOVER,
  directingMatchUpStatuses,
  nonDirectingMatchUpStatuses,
} from '@Constants/matchUpStatusConstants';

// constants and types
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';

/**
 * Resolving an irregular ending into a matchUpStatus.
 *
 * Every score-entry approach needs the same rule, and each once carried its own copy: "walkover with a winner is a
 * WALKOVER, walkover without one is a DOUBLE_WALKOVER". Here absence is absence: `undefined` is "not answered yet" and
 * is never valid, and a double exit requires explicitly choosing `NEITHER_SIDE`. Reading a missing winner as a double
 * exit was a fail-open default: a double exit advances nobody and propagates a
 * walkover downstream.
 */

/** The winner-selection value meaning "no side won": the explicit choice that produces a double exit. */
export const NEITHER_SIDE = 'NEITHER';

const FACTORY_DIRECTING = new Set<string>(directingMatchUpStatuses);
const FACTORY_NON_DIRECTING = new Set<string>(nonDirectingMatchUpStatuses);

/**
 * Every irregular ending score entry offers, in display order: the three that name a winner, then the three an
 * operator reaches for most mid-tournament, then the rest. They partition exactly onto the factory's directing and
 * non-directing classifications. `WITHDRAWN` is not a matchUpStatus: a withdrawal is expressed AS a walkover,
 * with its code in the WALKOVER group.
 */
export const SELECTABLE_ENDINGS: string[] = [
  RETIRED,
  WALKOVER,
  DEFAULTED,
  IN_PROGRESS,
  AWAITING_RESULT,
  SUSPENDED,
  ABANDONED,
  CANCELLED,
  INCOMPLETE,
  DEAD_RUBBER,
];

/** The endings that name a winner, derived from the factory's `directingMatchUpStatuses`. */
export const WINNER_REQUIRING_STATUSES = new Set<string>(
  SELECTABLE_ENDINGS.filter((status) => FACTORY_DIRECTING.has(status)),
);

/**
 * The endings that resolve nobody, derived independently from `nonDirectingMatchUpStatuses` (not as a complement),
 * so a status the factory classifies as neither shows up as a failure rather than being swept in.
 */
export const NON_DIRECTING_ENDINGS = new Set<string>(
  SELECTABLE_ENDINGS.filter((status) => FACTORY_NON_DIRECTING.has(status)),
);

/** Whether choosing this ending obliges the operator to name a winner. */
export function requiresWinner(selectedOutcome: string | undefined): boolean {
  return !!selectedOutcome && WINNER_REQUIRING_STATUSES.has(selectedOutcome);
}

/**
 * Statuses that carry NO score at all. The factory blanks the score for `{WALKOVER, DOUBLE_WALKOVER}`; CANCELLED and
 * DEAD_RUBBER are added by CLIENT policy (choosing them clears any partial score), so this set is
 * deliberately wider than the factory's. Not here: DEFAULTED / DOUBLE_DEFAULT and RETIRED, which keep what was
 * played, and ABANDONED / INCOMPLETE / SUSPENDED, where the partial score is the content of the result.
 */
export const NO_SCORE_STATUSES = new Set<string>([WALKOVER, DOUBLE_WALKOVER, CANCELLED, DEAD_RUBBER]);

/** Endings a typed score legitimately survives alongside: neither winner-naming nor score-clearing. */
export const SCORE_PRESERVING_ENDINGS = new Set<string>(
  SELECTABLE_ENDINGS.filter((status) => !WINNER_REQUIRING_STATUSES.has(status) && !NO_SCORE_STATUSES.has(status)),
);

/** Whether a typed score should be kept when this ending is selected. */
export function coexistsWithScore(selectedOutcome: string | undefined): boolean {
  return !!selectedOutcome && SCORE_PRESERVING_ENDINGS.has(selectedOutcome);
}

/** Whether this ending means "no score exists", so score validation is skipped rather than run and overridden. */
export function carriesNoScore(selectedOutcome: string | undefined): boolean {
  return !!selectedOutcome && NO_SCORE_STATUSES.has(selectedOutcome);
}

/** Unanswered (`undefined`), a side (`1` | `2`), or explicitly neither. */
export type WinnerSelection = 1 | 2 | typeof NEITHER_SIDE | undefined;

/** The double-exit status each ending produces when neither side won. RETIRED has none: no double retirement. */
const DOUBLE_EXIT_STATUS: Record<string, MatchUpStatusUnion> = {
  [WALKOVER]: DOUBLE_WALKOVER,
  [DEFAULTED]: DOUBLE_DEFAULT,
};

/** The double-exit statuses themselves, as opposed to the endings that produce them. */
export const DOUBLE_EXIT_STATUSES = new Set<string>([DOUBLE_WALKOVER, DOUBLE_DEFAULT]);

/** Whether this status IS a double exit: no side advances. */
export function isDoubleExitStatus(matchUpStatus: MatchUpStatusUnion | undefined): boolean {
  return !!matchUpStatus && DOUBLE_EXIT_STATUSES.has(matchUpStatus);
}

/**
 * The winner implied by a per-side exit control, where clicking a side means THAT side exits and the other wins.
 * `undefined` for a double exit and for the non-directing statuses, which resolve nothing.
 */
export function winnerFromExitingSide(
  matchUpStatus: MatchUpStatusUnion | undefined,
  exitingSideNumber?: number,
): number | undefined {
  if (!matchUpStatus || !exitingSideNumber) return undefined;
  if (!WINNER_REQUIRING_STATUSES.has(matchUpStatus)) return undefined;
  return exitingSideNumber === 1 ? 2 : 1;
}

/** Whether "neither side" is a legitimate answer for this ending. */
export function supportsNeitherSide(selectedOutcome: string | undefined): boolean {
  return !!selectedOutcome && selectedOutcome in DOUBLE_EXIT_STATUS;
}

export type IrregularEndingResolution = {
  /** The status to submit. `undefined` while the selection is incomplete. */
  matchUpStatus?: MatchUpStatusUnion;
  /** Present only when a side was named. A double exit deliberately carries none. */
  winningSide?: number;
  /** Whether this resolution may be submitted. */
  isValid: boolean;
  /** True when the operator still owes a winner answer: the fail-closed state. */
  awaitingWinner: boolean;
  /** True when the resolution is a double exit, so callers can warn before it is submitted. */
  isDoubleExit: boolean;
};

/**
 * Resolve an irregular ending plus a winner selection into the status to submit. `COMPLETED` is not an irregular
 * ending: an inert resolution comes back for it.
 */
export function resolveIrregularEnding(params: {
  selectedOutcome: string | undefined;
  winnerSelection: WinnerSelection;
}): IrregularEndingResolution {
  const { winnerSelection } = params;
  // The ending passes through as the status it names: a score state offers only `SELECTABLE_ENDINGS`, and an entry
  // approach reports only a status it parsed. This is where a host's string becomes a status, so it is narrowed once,
  // here.
  const selectedOutcome = params.selectedOutcome as MatchUpStatusUnion | undefined;

  if (!selectedOutcome || selectedOutcome === COMPLETED) {
    return { isValid: false, awaitingWinner: false, isDoubleExit: false };
  }

  // An ending that resolves nobody is complete as soon as it is chosen; it must come before the winner branches
  if (!requiresWinner(selectedOutcome)) {
    return { matchUpStatus: selectedOutcome, isValid: true, awaitingWinner: false, isDoubleExit: false };
  }

  if (winnerSelection === 1 || winnerSelection === 2) {
    return {
      matchUpStatus: selectedOutcome,
      winningSide: winnerSelection,
      isValid: true,
      awaitingWinner: false,
      isDoubleExit: false,
    };
  }

  if (winnerSelection === NEITHER_SIDE) {
    const doubleExitStatus = DOUBLE_EXIT_STATUS[selectedOutcome];
    // "Neither" on an ending with no double form (RETIRED) is not a resolution: fail closed
    if (!doubleExitStatus) {
      return { matchUpStatus: selectedOutcome, isValid: false, awaitingWinner: true, isDoubleExit: false };
    }
    return { matchUpStatus: doubleExitStatus, isValid: true, awaitingWinner: false, isDoubleExit: true };
  }

  // Unanswered: carry the selected status so a preview can render it, but refuse to submit
  return { matchUpStatus: selectedOutcome, isValid: false, awaitingWinner: true, isDoubleExit: false };
}

/**
 * The documented INVERSE of `resolveIrregularEnding`, for a matchUp that already carries a result. For every status
 * in `SELECTABLE_ENDINGS`, `resolveIrregularEnding(hydrateIrregularEnding(m))` returns the status `m` was saved with.
 * A double exit inverts to its base ending plus `NEITHER_SIDE`; a non-directing ending keeps no winner; anything else
 * inverts to COMPLETED with no winner. A missing winner on a winner-requiring status stays `undefined`: unanswered
 * must survive a save/reopen cycle as unanswered.
 */
export function hydrateIrregularEnding(matchUp?: { matchUpStatus?: MatchUpStatusUnion; winningSide?: number }): {
  selectedOutcome: string;
  winnerSelection: WinnerSelection;
} {
  const matchUpStatus = matchUp?.matchUpStatus;
  if (!matchUpStatus) return { selectedOutcome: COMPLETED, winnerSelection: undefined };

  if (DOUBLE_EXIT_STATUSES.has(matchUpStatus)) {
    const ending = Object.keys(DOUBLE_EXIT_STATUS).find((key) => DOUBLE_EXIT_STATUS[key] === matchUpStatus);
    return ending
      ? { selectedOutcome: ending, winnerSelection: NEITHER_SIDE }
      : { selectedOutcome: COMPLETED, winnerSelection: undefined };
  }

  if (!SELECTABLE_ENDINGS.includes(matchUpStatus)) return { selectedOutcome: COMPLETED, winnerSelection: undefined };

  if (!requiresWinner(matchUpStatus)) return { selectedOutcome: matchUpStatus, winnerSelection: undefined };

  const winningSide = matchUp?.winningSide;
  return {
    selectedOutcome: matchUpStatus,
    winnerSelection: winningSide === 1 || winningSide === 2 ? winningSide : undefined,
  };
}
