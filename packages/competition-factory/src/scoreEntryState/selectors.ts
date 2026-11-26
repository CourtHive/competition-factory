/**
 * Pure answers computed FROM a `ScoreEntryModel`.
 *
 * `scoreString`, `isComplete`, `winningSide`, `matchUpStatus` and `scoreEntryIssue` were once five members of a
 * region contract, answered by three entry approaches separately. Here each is ONE function of the model,
 * so the Dial Pad and Dynamic Sets cannot disagree about whether `7-6` without its points is finished,
 * and nothing is computed on the spot from a DOM input.
 *
 * ── Which sets count ──
 *
 * The model keeps a half-entered set; these selectors decide what it means. `enteredSets` reports only
 * sets with both principal cells in — the regions' `getSets()` rule, kept because a lone `6` read as
 * `6-0` once made the band claim a set nobody typed. `completedSets` narrows further to sets the factory
 * gives a winner. Neither touches the model.
 *
 * ── Invariant 10A lives here ──
 *
 * "Every set before the last must be complete." It cannot be enforced by refusing keystrokes, because
 * clearing set 1 to retype it is an ordinary thing to do, so it is a property: a model with an
 * unfinished or empty set before its last entered set is never `isComplete` and always reports an
 * issue. That is what makes `4-2 2-6 2-6` unsubmittable, and it is also what keeps note 9's ghost set
 * visible — `columns` shows every set that holds anything, so a cleared set 1 beside a full set 2 reads
 * as exactly the incomplete score it is.
 *
 * ── A score-clearing ending suppresses the score; it does not delete it ──
 *
 * While a walkover, cancellation or dead rubber is chosen, `scoreString` answers nothing, `isComplete`
 * is false and `scoreEntryIssue` is silent, because nothing typed will be submitted. `discardedScore` names what
 * the ending set aside so the band can still say so. The keystrokes stay in the model — see
 * `chooseEnding` — and every answer here comes back the moment the ending is un-chosen.
 *
 * ── Problems are reported as codes, not words ──
 *
 * `scoreEntryIssue` names what is wrong (`ScoreEntryIssue`: a code, the set it is in, and its data); a host words it.
 * courthive-components turns each code into the localized sentence its dialog has always shown. The factory's own
 * messages (a set `validateSetScore` refuses, an overtime set the scoring rules refuse) travel as `message`, in the
 * factory's words, exactly as the dialog showed them.
 */

import { validateSetScore } from '@Scoring/analysis/validateMatchUpScore';
import { isOvertimeFormat, overtimeProgress } from './overtime';
import { isCompletedLevelClose } from './levelClose';
import { resolveScoreEntry } from './ending';
import { scoreLine } from './scoreLine';
import {
  decidingIndex,
  deciderSetNumberOf,
  enteredFactorySets,
  gamesLoser,
  isEmptyEntry,
  isFinalSetIndex,
  isEntered,
  readCell,
} from './model';
import {
  getSetFormatForIndex,
  shouldShowTiebreak,
  isSetTiebreakOnly,
  matchUpConfigFor,
  isMatchComplete,
  getMatchWinner,
  isSetTimed,
} from './formatRules';

// constants and types
import type { MatchUpConfig, ScoreEntrySet, SideNumber } from './types';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import type { ScoreEntryModel, SetEntry } from './model';
import type { ScoreEntryResolution } from './ending';

/** One visible column: a set's principal cells, or the tiebreak cells beside a set that went to one. */
export type ScoreSlot = { kind: 'games' | 'tiebreak'; setIndex: number };

export type ColumnOptions = {
  /**
   * A set the operator has clicked back into, whose tiebreak column stays open though its points are
   * known. Presentation, held by the region — passed in rather than kept in the model.
   */
  editingSet?: number;
};

// ── The sets ─────────────────────────────────────────────────────────

/** The ending, resolved. The one place `resolveScoreEntry` is asked about a model. */
export function resolveEnding(model: ScoreEntryModel): ScoreEntryResolution {
  return resolveScoreEntry(model.ending);
}

/** Sets with BOTH principal cells in, in factory shape, positioned by `setNumber`. A partial set is not here. */
export function enteredSets(model: ScoreEntryModel): ScoreEntrySet[] {
  return enteredFactorySets(model.sets, configOf(model));
}

/** The entered sets that are SETTLED — see `isSettled`. A `4-2` is entered; it is not completed. */
export function completedSets(model: ScoreEntryModel): ScoreEntrySet[] {
  return enteredSets(model).filter((set) => isSettled(model, (set.setNumber ?? 0) - 1));
}

/** Whether ANYTHING has been typed, complete or not — a single digit counts. */
export function hasEntry(model: ScoreEntryModel): boolean {
  return model.sets.some((entry) => !isEmptyEntry(entry));
}

// ── The answers the card asks for ────────────────────────────────────

/** The score as it stands, in the factory's own line — or nothing while an ending has set it aside. */
export function scoreString(model: ScoreEntryModel): string | undefined {
  if (resolveEnding(model).clearsScore) return undefined;
  return scoreLine(enteredSets(model), model.matchUpFormat);
}

/** What a score-clearing ending set aside, so the band can name it. Nothing unless one is chosen. */
export function discardedScore(model: ScoreEntryModel): string | undefined {
  if (!resolveEnding(model).clearsScore) return undefined;
  return scoreLine(enteredSets(model), model.matchUpFormat);
}

/**
 * Whether the score is a FINISHED result: the factory names a winner, the last set is settled, and
 * nothing is wrong with what came before it. An ending that discards the score makes this false,
 * because there is no result to be finished.
 */
export function isComplete(model: ScoreEntryModel): boolean {
  if (resolveEnding(model).clearsScore) return false;

  const config = configOf(model);
  const last = lastHoldingIndex(model);
  if (last === undefined || !isSettled(model, last)) return false;

  // A match the factory completes level (a combined-point tie, an exactly or aggregate count closed
  // level) is finished with no winner.
  // An overtime format the engine completes level (a finite ceiling with no decider) is finished with no winner.
  const decided =
    getMatchWinner(enteredSets(model), config) !== undefined ||
    isCompletedLevelClose(enteredSets(model), model.matchUpFormat) ||
    (isOvertimeFormat(config) && isMatchComplete(enteredSets(model), config));
  return decided && scoreEntryIssue(model) === undefined;
}

/** The winner: the ending's when it names one, otherwise the finished score's. */
export function winningSide(model: ScoreEntryModel): SideNumber | undefined {
  const resolution = resolveEnding(model);
  if (resolution.hasEnding) {
    if (resolution.winningSide === 1 || resolution.winningSide === 2) return resolution.winningSide;
    if (resolution.isDoubleExit) return undefined;
  }
  if (!isComplete(model)) return undefined;
  return getMatchWinner(enteredSets(model), configOf(model));
}

/** The ending's status when one is chosen; `COMPLETED` for a finished score; nothing otherwise. */
export function matchUpStatus(model: ScoreEntryModel): string | undefined {
  const resolution = resolveEnding(model);
  if (resolution.hasEnding) return resolution.matchUpStatus;
  return isComplete(model) ? COMPLETED : undefined;
}

/**
 * What is wrong with a score state's score, as data. Every issue carries the index of the set it is in.
 *
 *   - `TIEBREAK_CONTRADICTION`: a tiebreak whose points say the other side won the set; `gamesWinner` won it on games
 *   - `INVALID_SET`: a set the factory's `validateSetScore` refuses, in its words (`message`)
 *   - `SET_HAS_NO_SCORE` / `SET_NOT_FINISHED`: invariant 10A, a set before the last entered one that is empty or
 *     unfinished
 *   - `OVERTIME_REFUSED`: an overtime set the scoring rules would not take, with their reason (`message`)
 */
export type ScoreEntryIssue =
  | { code: 'TIEBREAK_CONTRADICTION'; setIndex: number; gamesWinner: SideNumber }
  | { code: 'INVALID_SET'; setIndex: number; message: string }
  | { code: 'SET_HAS_NO_SCORE'; setIndex: number }
  | { code: 'SET_NOT_FINISHED'; setIndex: number }
  | { code: 'OVERTIME_REFUSED'; setIndex: number; message: string };

export const TIEBREAK_CONTRADICTION = 'TIEBREAK_CONTRADICTION';
export const INVALID_SET = 'INVALID_SET';
export const SET_HAS_NO_SCORE = 'SET_HAS_NO_SCORE';
export const SET_NOT_FINISHED = 'SET_NOT_FINISHED';
export const OVERTIME_REFUSED = 'OVERTIME_REFUSED';

/**
 * The first thing wrong with the score, or `undefined`. Three checks, in order:
 *
 *   1. a tiebreak that contradicts who won the set (named by a host: "side 1" is not a message an operator can act
 *      on), asked before the factory's own refusal of the same thing;
 *   2. the FACTORY's judgement of each entered set (`validateSetScore` with `allowIncomplete`), which forgives
 *      unfinished games but knows `3-7` cannot be. A set whose tiebreak points are still owed is skipped;
 *   3. invariant 10A: a set before the last entered one that is empty or unfinished; then an overtime refusal.
 *
 * Silent while a score-clearing ending is chosen: nothing typed will be submitted.
 */
export function scoreEntryIssue(model: ScoreEntryModel): ScoreEntryIssue | undefined {
  if (resolveEnding(model).clearsScore) return undefined;

  const config = configOf(model);
  for (const [index, entry] of model.sets.entries()) {
    if (!isEntered(entry)) continue;
    const problem = tiebreakContradiction(index, entry) ?? setError(model, index, entry, config);
    if (problem) return problem;
  }

  return unfinishedBeforeLast(model) ?? overtimeRefusal(model);
}

/** An overtime set the scoring rules would not take — a period after the match was decided, two scorers in a
 * sudden-death period, a shootout tally no shootout ends on — with the rules' own reason. */
function overtimeRefusal(model: ScoreEntryModel): ScoreEntryIssue | undefined {
  if (!isOvertimeFormat(model.matchUpFormat)) return undefined;
  const { refused, refusedAt } = overtimeProgress(model.matchUpFormat, enteredSets(model));
  if (!refused || refusedAt === undefined) return undefined;
  return { code: OVERTIME_REFUSED, setIndex: refusedAt, message: refused };
}

/** A tiebreak whose points contradict the games. A tied pair is left to the factory, whose margin message fits. */
function tiebreakContradiction(index: number, entry: SetEntry): ScoreEntryIssue | undefined {
  if (entry.tiebreak1 === undefined || entry.tiebreak2 === undefined) return undefined;
  if (entry.tiebreak1 === entry.tiebreak2) return undefined;

  const loser = gamesLoser(entry);
  if (loser === undefined) return undefined;

  const gamesWinner: SideNumber = loser === 1 ? 2 : 1;
  const pointsWinner: SideNumber = entry.tiebreak1 > entry.tiebreak2 ? 1 : 2;
  if (pointsWinner === gamesWinner) return undefined;

  return { code: TIEBREAK_CONTRADICTION, setIndex: index, gamesWinner };
}

function setError(
  model: ScoreEntryModel,
  index: number,
  entry: SetEntry,
  config: MatchUpConfig,
): ScoreEntryIssue | undefined {
  if (tiebreakOutstanding(model, index)) return undefined;

  // A single timed 0–0 cannot be completed. Ask the factory for its completion refusal,
  // while a chosen non-completed ending still records the unfinished score as before.
  const allowIncomplete = resolveEnding(model).hasEnding || !scorelessSingleTimedSet(entry, index, config);
  const { isValid, error: message } = validateSetScore(
    strictSetShape(entry, isSetTiebreakOnly(getSetFormatForIndex(index, config))),
    model.matchUpFormat,
    isFinalSetIndex(index, config),
    allowIncomplete,
  );

  if (isValid || !message) return undefined;
  return { code: INVALID_SET, setIndex: index, message };
}

/** Invariant 10A, as an issue: the first set before the last entered one that is not settled. */
function unfinishedBeforeLast(model: ScoreEntryModel): ScoreEntryIssue | undefined {
  const last = lastHoldingIndex(model);
  if (last === undefined) return undefined;

  for (let index = 0; index < last; index += 1) {
    if (isSettled(model, index)) continue;
    return { code: isEmptyEntry(model.sets[index]) ? SET_HAS_NO_SCORE : SET_NOT_FINISHED, setIndex: index };
  }
  return undefined;
}

// ── Layout ───────────────────────────────────────────────────────────

/**
 * The visible columns, left to right.
 *
 * Every set that holds anything is shown, whatever came before it — this is the rule that ends the
 * ghost set: a cleared set 1 beside a typed set 2 shows BOTH, one empty and one full, so the operator
 * sees the score the model has. Then one empty set opens after the last holding one, and only when
 * everything before it is settled and the match is not decided; a timed format plays every bolt, so
 * for it the only question is whether one is left. A tiebreak column sits beside a set whose games call
 * for points it does not yet have, or that the operator has reopened.
 */
export function columns(model: ScoreEntryModel, options: ColumnOptions = {}): ScoreSlot[] {
  const config = configOf(model);
  const last = lastHoldingIndex(model);
  const slots: ScoreSlot[] = [];

  if (last !== undefined) {
    for (let index = 0; index <= last; index += 1) {
      slots.push({ kind: 'games', setIndex: index });
      if (tiebreakVisible(model, index, options.editingSet)) slots.push({ kind: 'tiebreak', setIndex: index });
    }
  }

  const next = last === undefined ? 0 : last + 1;
  if (next < model.sets.length && opensSet(model, next, config)) slots.push({ kind: 'games', setIndex: next });

  return slots;
}

/** Whether the empty set at `index` may be offered for entry. The first always is. */
function opensSet(model: ScoreEntryModel, index: number, config: MatchUpConfig): boolean {
  if (index === 0) return true;
  for (let before = 0; before < index; before += 1) if (!isSettled(model, before)) return false;
  // an overtime format plays another set only while the scoring engine calls the match undecided
  if (isOvertimeFormat(config)) return !isMatchComplete(enteredFactorySets(model.sets.slice(0, index), config), config);
  // An aggregate format's decider (set N + 1) is played only when the N sets leave the total level
  if (index + 1 === deciderSetNumberOf(config)) return aggregateIsLevel(model, index);
  if (isSetTimed(getSetFormatForIndex(index - 1, config))) return true;
  return decidingIndex(model.sets, config) === undefined && getMatchWinner(enteredSets(model), config) === undefined;
}

/** Whether the first `count` sets leave the aggregate total level. */
function aggregateIsLevel(model: ScoreEntryModel, count: number): boolean {
  const counted = model.sets.slice(0, count);
  const total = (side: 'side1' | 'side2') => counted.reduce((sum, entry) => sum + (entry[side] ?? 0), 0);
  return total('side1') === total('side2');
}

// ── Per-set questions, shared by the answers above ───────────────────

/**
 * Whether a set is finished: both principal cells in, no tiebreak half-typed, and the factory accepts
 * it as a COMPLETE legal set.
 *
 * ── A `7-6` with no points is settled ──
 *
 * It read unsettled until then: the next set did not open and Submit stayed dead until the points were
 * in, while the engine had recorded a bare `7-6` (`TIEBREAK_POINTS_NOT_RECORDED`) and,
 * since 7.33.0, calls it complete on the read surface too. The points are OFFERED, not owed: the column
 * opens and takes focus, and the operator types them or moves on. A pair half-typed — one side's points
 * and not the other's — is still unsettled, as it is mid-keystroke. `unrecordedTiebreakNote` says what
 * was left out, so leniency is never silent.
 *
 * ── Strict `validateSetScore`, and not `analyzeSet`'s winning side ──
 *
 * Measured 2026-09-30, before `#5049(factory)`: `analyzeSet` named a winner for a `3-1` in a match
 * tiebreak to ten, and for a `10-9` — any lead read as a win. Both answers are fixed in 7.4.0, and
 * `formatRules` asks the factory too. Strict validation stays the rule here all the same: it is
 * the same answer `scoreEntryIssue` reports, so "settled" and "no issue" cannot come apart.
 *
 * Timed periods may finish scoreless, but a single non-aggregate timed set needs a score before
 * it can be completed. Keep the period exception without treating an unplayed match as finished.
 */
export function isSettled(model: ScoreEntryModel, index: number): boolean {
  const entry = model.sets[index];
  if (!entry || !isEntered(entry) || tiebreakPartial(model, index)) return false;

  const config = configOf(model);
  const setFormat = getSetFormatForIndex(index, config);
  if (isSetTimed(setFormat)) return !scorelessSingleTimedSet(entry, index, config);

  return validateSetScore(
    strictSetShape(entry, isSetTiebreakOnly(setFormat)),
    model.matchUpFormat,
    isFinalSetIndex(index, config),
    false,
  ).isValid;
}

function scorelessSingleTimedSet(entry: SetEntry, index: number, config: MatchUpConfig): boolean {
  return (
    index === 0 &&
    (config.exactly ?? config.bestOf) === 1 &&
    !config.aggregate &&
    isSetTimed(getSetFormatForIndex(index, config)) &&
    entry.side1 === 0 &&
    entry.side2 === 0
  );
}

/** An entry as `validateSetScore` reads it: a tiebreak-only set's points go in the tiebreak fields. */
function strictSetShape(entry: SetEntry, tiebreakOnly: boolean): Record<string, number | undefined> {
  if (tiebreakOnly) return { side1TiebreakScore: entry.side1, side2TiebreakScore: entry.side2 };
  return {
    side1Score: entry.side1,
    side2Score: entry.side2,
    side1TiebreakScore: entry.tiebreak1,
    side2TiebreakScore: entry.tiebreak2,
  };
}

/**
 * Whether the set's games call for a tiebreak whose points are not both in. Where the regions send focus
 * and where the column shows; NOT whether the set is finished — see `isSettled`.
 */
export function tiebreakOutstanding(model: ScoreEntryModel, index: number): boolean {
  const entry = model.sets[index];
  return tiebreakApplies(model, index) && (entry.tiebreak1 === undefined || entry.tiebreak2 === undefined);
}

/** Whether one side's tiebreak points are in and the other's are not: a pair mid-keystroke. */
function tiebreakPartial(model: ScoreEntryModel, index: number): boolean {
  const entry = model.sets[index];
  return tiebreakApplies(model, index) && (entry.tiebreak1 === undefined) !== (entry.tiebreak2 === undefined);
}

/** Whether the set's games say a tiebreak was played and neither side's points are recorded. */
function tiebreakUnrecorded(model: ScoreEntryModel, index: number): boolean {
  const entry = model.sets[index];
  return tiebreakApplies(model, index) && entry.tiebreak1 === undefined && entry.tiebreak2 === undefined;
}

/**
 * The sets decided by their tiebreak that carry no points, by index: the band says `1st set: tiebreak points not
 * recorded`. The engine records such a set and warns (`TIEBREAK_POINTS_NOT_RECORDED`); a host says so before Submit
 * rather than after, so the leniency is a choice the operator can see. Empty while a score-clearing ending is chosen.
 */
export function unrecordedTiebreakSets(model: ScoreEntryModel): number[] {
  if (resolveEnding(model).clearsScore) return [];
  return model.sets
    .map((_, index) => index)
    .filter((index) => isEntered(model.sets[index]) && tiebreakUnrecorded(model, index));
}

/** Whether the PAIR of games implies a tiebreak was played — `7-6` yes, `7-5` no, a lone `7` nothing. */
function tiebreakApplies(model: ScoreEntryModel, index: number): boolean {
  const entry = model.sets[index];
  if (!isEntered(entry)) return false;
  const config = configOf(model);
  if (isSetTiebreakOnly(getSetFormatForIndex(index, config))) return false;
  return shouldShowTiebreak(index, { side1: entry.side1 as number, side2: entry.side2 as number }, config);
}

function tiebreakVisible(model: ScoreEntryModel, index: number, editingSet: number | undefined): boolean {
  return tiebreakApplies(model, index) && (tiebreakOutstanding(model, index) || editingSet === index);
}

/** The index of the last set holding anything, or `undefined` when nothing has been typed. */
function lastHoldingIndex(model: ScoreEntryModel): number | undefined {
  for (let index = model.sets.length - 1; index >= 0; index -= 1) {
    if (!isEmptyEntry(model.sets[index])) return index;
  }
  return undefined;
}

function configOf(model: ScoreEntryModel): MatchUpConfig {
  return matchUpConfigFor(model.matchUpFormat);
}

/** The value in one cell. Exported for regions, which render cells from the model and never read them back. */
export function cellValue(
  model: ScoreEntryModel,
  setIndex: number,
  side: SideNumber,
  kind: ScoreSlot['kind'],
): number | undefined {
  const entry = model.sets[setIndex];
  return entry ? readCell(entry, { setIndex, side, kind }) : undefined;
}
