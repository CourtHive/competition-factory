/**
 * `tods-competition-factory/score-entry-state`: a headless score-entry STATE ENGINE.
 *
 * One immutable value (`ScoreEntryModel`) holds what an operator has typed and chosen for one matchUp: the cells of
 * each set, half-entered sets included, and how the match ended. Transitions return the next model, or the SAME object
 * when they refuse. Selectors answer what the score state means; rules answer what may be submitted; `toEngineOutcome`
 * turns a submission into the `outcome` `setMatchUpStatus` reads.
 *
 * It holds a score state and nothing else. It loads no record, holds no tournament, authorizes nobody, performs no
 * advancement, queries nothing and submits nothing. A host supplies the format, any saved score and ending
 * (`createScoreEntryModel`), and the status restrictions and clear permission its own `SCORE` action reported
 * (`ScoreEntryRulesContext`, `ClearGateInput.clearable`). Every scoring rule is the factory's own, imported narrowly:
 * this entry point reaches no engine, no global engine state, no `async_hooks`, no DOM and no root barrel, so a
 * browser, a worker and a Node process can each hold independent score states.
 *
 * A host's loop:
 *
 * ```ts
 * import * as entry from 'tods-competition-factory/score-entry-state';
 *
 * let model = entry.createScoreEntryModel({ matchUpFormat: 'SET3-S:6/TB7', sets: saved?.score?.sets, matchUp: saved });
 * model = entry.typeDigit(model, { cell: { setIndex: 0, side: 1, kind: 'games' }, digit: 4, complement: true });
 * const view = { model };
 * const gate = entry.clearGate({ openedOnRecordedOutcome: !!saved, cleared: false, holdsEntry: entry.holdsEntry(view) });
 * const reported = entry.submission(view, gate, { disabledMatchUpStatuses });
 * if (reported) send(entry.toEngineOutcome({ ...reported, sets: entry.enteredSets(model) }, changedFormat));
 * ```
 *
 * Problems are codes (`ScoreEntryIssue`, `EndingRefusal`), not sentences: a host words them.
 */

// constants and types
export type { MatchUpConfig, ScoreEntrySet, SetFormat, SideNumber } from './types';
export type { MatchUpStatusUnion } from '@Types/tournamentTypes';
export type {
  ScoreEntryApproach,
  SetEntry,
  CellRef,
  ScoreEntryModel,
  EndingIntent,
  CreateScoreEntryModelParams,
  TypeDigitIntent,
} from './model';
export type { ScoreEntryState, ScoreEntryResolution } from './ending';
export type { IrregularEndingResolution, WinnerSelection } from './irregularEnding';
export type { StatusCodeEntry, StatusCodeGroups, RecordedReason } from './statusCodes';
export type { ScoreSlot, ColumnOptions, ScoreEntryIssue } from './selectors';
export type {
  ScoreEntryView,
  ScoreEntryRulesContext,
  ScoreEntryOutcome,
  ScopeIssue,
  EndingRefusal,
  ClearGateInput,
  ClearGate,
} from './rules';
export type { ReportedOutcome, EngineOutcome } from './engineOutcome';
export type { OvertimeProgress, OvertimePhase } from './overtime';

// the score state: creation, hydration and transitions
export {
  DEFAULT_MATCH_UP_FORMAT,
  createScoreEntryModel,
  typeDigit,
  setCell,
  clearCell,
  clearScore,
  clearAll,
  chooseEnding,
  changeFormat,
  switchApproach,
  replaceSets,
  readCell,
  gamesLoser,
  isEntered,
  isEmptyEntry,
  setCountOf,
  isFinalSetIndex,
  deciderSetNumberOf,
  decidingIndex,
  enteredFactorySets,
  toFactorySet,
} from './model';

// the ending
export {
  emptyScoreEntryState,
  chooseSideEnding,
  chooseMatchEnding,
  toggleBothSidesOut,
  offersBothSidesOut,
  chooseReasonCode,
  hydrateScoreEntryState,
  reasonCodeStatus,
  resolveScoreEntry,
  resolveReportedEnding,
  sideEndingOptions,
  matchEndingOptions,
} from './ending';
export {
  NEITHER_SIDE,
  SELECTABLE_ENDINGS,
  WINNER_REQUIRING_STATUSES,
  NON_DIRECTING_ENDINGS,
  NO_SCORE_STATUSES,
  SCORE_PRESERVING_ENDINGS,
  DOUBLE_EXIT_STATUSES,
  requiresWinner,
  coexistsWithScore,
  carriesNoScore,
  isDoubleExitStatus,
  winnerFromExitingSide,
  supportsNeitherSide,
  resolveIrregularEnding,
  hydrateIrregularEnding,
} from './irregularEnding';
export { groupKeyForStatus, recordedStatusCode, normalizeStatusCode, codesForStatus } from './statusCodes';

// what the score state means
export {
  TIEBREAK_CONTRADICTION,
  INVALID_SET,
  SET_HAS_NO_SCORE,
  SET_NOT_FINISHED,
  OVERTIME_REFUSED,
  resolveEnding,
  enteredSets,
  completedSets,
  hasEntry,
  scoreString,
  discardedScore,
  isComplete,
  winningSide,
  matchUpStatus,
  scoreEntryIssue,
  unrecordedTiebreakSets,
  columns,
  isSettled,
  tiebreakOutstanding,
  cellValue,
} from './selectors';

// what may be submitted
export {
  STATUS_UNAVAILABLE,
  statusOutOfScope,
  scoreIsFinished,
  scoreEntered,
  holdsEntry,
  resolutionInForce,
  scoreEntryProblem,
  contradictsFinishedScore,
  endingOffered,
  endingRefusal,
  retractEndingContradictedByScore,
  scoreLocked,
  clearScoreForEnding,
  clearGate,
  footerState,
  clearHeadline,
  submission,
} from './rules';
export { toEngineOutcome, positionalCodes } from './engineOutcome';

// the format rules a score state is judged by, all the factory's
export {
  matchUpConfigFor,
  getSetFormatForIndex,
  isSetTiebreakOnly,
  isSetTimed,
  getMaxAllowedScore,
  isSetComplete,
  getSetWinner,
  isMatchComplete,
  getMatchWinner,
  calculateComplement,
  shouldShowTiebreak,
  buildSetScore,
} from './formatRules';
export {
  PLAYED_AFTER_DECIDED,
  isOvertimeFormat,
  overtimeSetCeiling,
  overtimeSetFormat,
  overtimePhaseOf,
  overtimeDeciderSetNumber,
  overtimeProgress,
} from './overtime';
export { isCompletedCombinedPointTie, isCompletedLevelClose } from './levelClose';
export { tiebreakOnlyTarget, completeTiebreakOnly } from './tiebreakEntry';
export { scoreLine } from './scoreLine';
