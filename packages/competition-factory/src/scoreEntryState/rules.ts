/**
 * A score state's rules about endings, clearing and submitting, as pure functions of the model.
 *
 * Nothing in them is about the DOM: each answers a question from the model, plus the two things an entry approach
 * knows that the model cannot (`ScoreEntryView`). A host decides where things sit and what they are called; whether
 * an ending is offered, whether a score is finished, what Submit sends and when it is live are answered here. A
 * refusal is a code a host words (courthive-components keeps the dialog's sentences).
 *
 * CA's rulings behind each rule are quoted where the rule is, so the reason travels with it.
 */
import { NON_DIRECTING_ENDINGS, NO_SCORE_STATUSES } from './irregularEnding';
import { resolveReportedEnding } from './ending';
import { clearScore } from './model';
import {
  scoreEntryIssue,
  discardedScore,
  resolveEnding,
  scoreString,
  winningSide,
  isComplete,
  hasEntry,
} from './selectors';

// constants and types
import type { MatchUpStatusUnion } from '@Types/tournamentTypes';
import { DEFAULTED, RETIRED } from '@Constants/matchUpStatusConstants';
import type { ScoreEntryModel, EndingIntent } from './model';
import type { ScoreEntryResolution } from './ending';
import type { ScoreEntryIssue } from './selectors';

/**
 * What the card's rules read: the model, and what the active region holds that the model cannot.
 *
 * Only Free Score supplies the two optional members — a status parsed out of its text (`6-4 ret`), and a
 * half-typed field (`6-4 re`) that parses to no new set but is still something the operator entered.
 */
export type ScoreEntryView = {
  model: ScoreEntryModel;
  /** A matchUpStatus the region parsed out of typed text. REPORTED, never selected. */
  reportedStatus?: MatchUpStatusUnion;
  /** Entry the model cannot see. */
  regionHasEntry?: boolean;
};

/** The host's scope: statuses its factory `SCORE` action refuses for this matchUp. */
export type ScoreEntryRulesContext = {
  disabledMatchUpStatuses?: readonly string[];
};

/** Whether a status is out of the host's scope. Scope comes from the host's `SCORE` action, never from heuristics. */
export function statusOutOfScope(status: string | undefined, disabledMatchUpStatuses: readonly string[] = []): boolean {
  return !!status && new Set(disabledMatchUpStatuses).has(status);
}

/**
 * What the card reports when Submit is pressed.
 *
 * `winningSide` is the ending's where one was recorded and the SCORE's otherwise. Both are real answers
 * and a host needs whichever applies: measured 2026-09-27, this carried only the ending's, so an
 * ordinary 6-4 6-3 submitted as `{ matchUpStatus: undefined, winningSide: undefined }` — the 95% case
 * reporting nothing at all about who won.
 */
export type ScoreEntryOutcome = {
  matchUpStatus?: MatchUpStatusUnion;
  winningSide?: number;
  reasonCode?: string;
  /** The score as the region formats it, which is what a host stores alongside the outcome. */
  score?: string;
  /**
   * The operator cleared a recorded outcome and submitted the empty result — REMOVE what is stored.
   *
   * Only ever `true`, never `false`, so a host that does not know about it is unaffected. It exists
   * because an empty outcome is otherwise indistinguishable from a submission that says nothing, and
   * the two must not be treated alike: one erases a stored score and the other must not.
   */
  cleared?: boolean;
};

// ── The score ────────────────────────────────────────────────────────

/**
 * Whether the SCORE is a finished result.
 *
 * The model's `isComplete`, with the parser's rule kept for Free Score: a region-reported ending means
 * the text is not claiming a finished match — `6-4 6-3 ret` is a retirement with a score — so the
 * score stops being a result the moment the text says how the match ended instead.
 */
export function scoreIsFinished(view: ScoreEntryView): boolean {
  return isComplete(view.model) && !view.reportedStatus;
}

/** Whether any score has been entered — in the model, or as text the region holds that the model cannot see yet. */
export function scoreEntered(view: ScoreEntryView): boolean {
  return hasEntry(view.model) || !!view.regionHasEntry;
}

/** Whether anything at all has been entered — a score, an ending, a reason, or text the model cannot see. */
export function holdsEntry(view: ScoreEntryView): boolean {
  const current = view.model.ending;
  const chosen = [current.sideEnding, current.matchEnding, current.reasonCode].some(Boolean);
  return chosen || hasEntry(view.model) || !!view.regionHasEntry;
}

/**
 * The resolution in force: the operator's selection, or failing that whatever the region parsed.
 *
 * A selected ending always wins. Only when nothing is selected does a region-reported status apply,
 * which is what keeps Free Score's "6-4 ret" working without letting parsed text override a click.
 */
export function resolutionInForce(view: ScoreEntryView): ScoreEntryResolution {
  const selected = resolveEnding(view.model);
  if (selected.hasEnding) return selected;

  return resolveReportedEnding(view.reportedStatus, winningSide(view.model));
}

/** A status the host's scope refuses, as an issue beside the score's own. */
export type ScopeIssue = { code: 'STATUS_UNAVAILABLE'; matchUpStatus: MatchUpStatusUnion };

export const STATUS_UNAVAILABLE = 'STATUS_UNAVAILABLE';

/** The status-scope refusal first, then the score's own issue. */
export function scoreEntryProblem(
  view: ScoreEntryView,
  context: ScoreEntryRulesContext = {},
): ScopeIssue | ScoreEntryIssue | undefined {
  const status = resolutionInForce(view).matchUpStatus;
  if (status && statusOutOfScope(status, context.disabledMatchUpStatuses)) {
    return { code: STATUS_UNAVAILABLE, matchUpStatus: status };
  }
  return scoreEntryIssue(view.model);
}

// ── Endings against the score ────────────────────────────────────────

/** The endings that say the match did not finish AND keep the score that says it did. */
export function contradictsFinishedScore(status: string): boolean {
  if (status === RETIRED || status === DEFAULTED) return true;
  return NON_DIRECTING_ENDINGS.has(status) && !NO_SCORE_STATUSES.has(status);
}

/**
 * Whether an ending can be chosen at all, given the score.
 *
 * CA, 2026-09-30: *"I should not be able to select (Retired) if the score is actually complete!"* A
 * retirement means the match did not finish, and a finished score says it did.
 *
 * CA, 2026-10-04, on DEFAULTED: *"keep the score (and then refuse Defaulted on a complete score)"*.
 * A default keeps the part-score it was given at, so it is the same contradiction as a retirement
 * and is refused the same way. DOUBLE_DEFAULT is not offered on its own — it is DEFAULTED with "no
 * one advances" ticked — so refusing DEFAULTED refuses it too.
 *
 * The match-level endings that resolve nobody (Suspended, Abandoned, Incomplete, In Progress,
 * Awaiting Result) say the same thing about the match — it did not finish — and keep the score
 * beside them, so a finished score refuses them too. Before this, finishing the score and THEN
 * clicking Suspended submitted SUSPENDED with a complete score: the retraction below only ran when
 * the score changed, so the other order walked straight past it.
 *
 * A retirement keeps the score that was played; with nothing played there is nothing to keep, and the
 * result would be a walkover wearing the wrong name (CA, 2026-10-08: "Retired is only supposed to be
 * enabled once there is a score present"). A default is different: a player can be defaulted before the
 * first ball, so it stays offered.
 *
 * NOT refused: the endings that carry no score at all — a walkover, Cancelled, Dead Rubber. Choosing
 * one on a complete score CLEARS it (`clearScoreForEnding`), which resolves the contradiction the other
 * way instead of leaving it standing.
 */
export function endingOffered(
  status: string,
  view: ScoreEntryView,
  disabledMatchUpStatuses: readonly string[] = [],
): boolean {
  if (statusOutOfScope(status, disabledMatchUpStatuses)) return false;
  if (status === RETIRED && !scoreEntered(view)) return false;
  if (!contradictsFinishedScore(status)) return true;
  return !scoreIsFinished(view);
}

export type EndingRefusal = 'STATUS_UNAVAILABLE' | 'ENDING_NEEDS_SCORE' | 'ENDING_AFTER_COMPLETE_SCORE';

/** Why an ending control is disabled: out of scope, Retired with no score, or a finished score. */
export function endingRefusal(
  status: string,
  view: ScoreEntryView,
  context: ScoreEntryRulesContext = {},
): EndingRefusal {
  if (statusOutOfScope(status, context.disabledMatchUpStatuses)) return STATUS_UNAVAILABLE;
  if (status === RETIRED && !scoreEntered(view)) return 'ENDING_NEEDS_SCORE';
  return 'ENDING_AFTER_COMPLETE_SCORE';
}

/**
 * The ending a score that has just finished contradicts, as the intent that un-chooses it.
 *
 * CA, 2026-09-30: *"If I click (Suspended) and then complete the score the Suspended status should
 * disappear. A completed score should cause matchUpStatus to change to COMPLETED."*
 *
 * Applies to every ending that resolves nobody — Suspended, Abandoned, Incomplete — and to a side
 * RETIRED or DEFAULTED, which is the same contradiction reached from the other direction:
 * `endingOffered` refuses it when the score is already complete, and this refuses it when the score
 * becomes complete after. A rule enforced on only one of those orders is a rule an operator can walk
 * around.
 *
 * Every ending control is a toggle, so the intent that chose the ending is the one that un-chooses it.
 * `undefined` when the score is not finished or nothing it contradicts is chosen.
 */
export function retractEndingContradictedByScore(view: ScoreEntryView): EndingIntent | undefined {
  if (!scoreIsFinished(view)) return undefined;

  const current = view.model.ending;
  if (current.matchEnding && NON_DIRECTING_ENDINGS.has(current.matchEnding)) {
    return { kind: 'match', status: current.matchEnding };
  }

  const side = current.sideEnding;
  if (side && (side.status === RETIRED || side.status === DEFAULTED)) {
    return { kind: 'side', sideNumber: side.sideNumber, status: side.status };
  }

  return undefined;
}

/**
 * Whether the score cannot be TYPED: the operator SELECTED an ending that carries none.
 *
 * Read from the selection, never from what a region reported: locking Free Score's field on a `wo`
 * parsed out of it would lock the operator out of their own sentence mid-word.
 */
export function scoreLocked(model: ScoreEntryModel): boolean {
  return resolveEnding(model).clearsScore;
}

/**
 * The model with its score discarded, when the chosen ending cannot have one — and the score it took.
 *
 * CA, 2026-09-30: *"when I enter set score(s) and then select (Walkover) the set score(s) should
 * clear."* Driven by `carriesNoScore` through `resolveScoreEntry`: WALKOVER, DOUBLE_WALKOVER, CANCELLED,
 * DEAD_RUBBER. **DEFAULTED is NOT in it** (CA, 2026-10-04): a default keeps the score it was given at.
 *
 * `discarded` is for the band alone — a past tense, never re-entered and never submitted. `undefined`
 * when the ending keeps the score, which tells the card to forget any past tense it was holding.
 */
export function clearScoreForEnding(
  model: ScoreEntryModel,
): { model: ScoreEntryModel; discarded?: string } | undefined {
  if (!resolveEnding(model).clearsScore) return undefined;
  return { model: clearScore(model), discarded: discardedScore(model) };
}

// ── Clear and Submit ─────────────────────────────────────────────────

export type ClearGateInput = {
  /** The card OPENED on a score, an ending or a reason — read once, before the operator touches anything. */
  openedOnRecordedOutcome: boolean;
  /** `[Clear]` was pressed at some point. Never reset; `submitsAClear` needs the card empty anyway. */
  cleared: boolean;
  /** The host's answer from the engine's `CLEAR_SCORE` action. Only `false` refuses. */
  clearable?: boolean;
  /** Whether the card holds anything now — `holdsEntry`. */
  holdsEntry: boolean;
};

export type ClearGate = {
  /** A recorded outcome the host says cannot be removed. Decided at open. */
  removalRefused: boolean;
  /** The removal is refused AND the card is empty: submitting now would be the refused removal. */
  refusedNow: boolean;
  /** Pressing Submit now means *"remove the recorded outcome"*. */
  submitsAClear: boolean;
};

/**
 * Whether Submit removes what the card opened on, and whether that removal is refused.
 *
 * Three conditions for a clear, and all three are load-bearing:
 *
 *   - `cleared` — the operator pressed `[Clear]`. Arriving at an empty card by backspacing is not the
 *     same act, and the shipping modal did not treat it as one either.
 *   - `openedOnRecordedOutcome` — there was something to remove. Submitting blank on a matchUp that
 *     never had a score is a no-op, not a clear, and offering it would be offering nothing.
 *   - `!holdsEntry` — the card is still empty. This is what makes a clear-then-retype submit the SCORE
 *     rather than a deletion, and it is why `cleared` needs no reset.
 *
 * Mirrors the removed `scoringModal`'s `wasCleared && hadExistingScore`, deliberately: CA asked for it by
 * name — *"the current scoring modals allow for an empty score to be submitted which clears a submitted
 * score in the factory for the matchUp being modified"*.
 *
 * `clearable: false` withholds only the removal: `[Clear]` still resets the form so the operator can type
 * a replacement score.
 */
export function clearGate(input: ClearGateInput): ClearGate {
  const removalRefused = input.clearable === false && input.openedOnRecordedOutcome;
  return {
    removalRefused,
    refusedNow: removalRefused && !input.holdsEntry,
    submitsAClear: input.cleared && input.openedOnRecordedOutcome && !input.holdsEntry && !removalRefused,
  };
}

/**
 * Whether Submit and Clear are live.
 *
 * Submit is live when an ending resolves, OR when the score is a finished result. The OR is the point: the 95% case is
 * a played-out match with no ending at all, and gating on the ending alone would make Submit dead for it. Gating on
 * the score alone would make a walkover unsubmittable. A PROBLEM closes it regardless: a 3-7 is not made submittable
 * by also being marked Suspended. `submitRefusedNow` is the refused removal (`clearGate`), which a host explains.
 *
 * Clear is live whenever the score state holds anything — an ENDING counts even with no score typed.
 */
export function footerState(
  view: ScoreEntryView,
  gate: ClearGate,
  context: ScoreEntryRulesContext = {},
): { submitDisabled: boolean; submitRefusedNow: boolean; clearDisabled: boolean } {
  const resolution = resolutionInForce(view);
  const submitDisabled =
    gate.refusedNow ||
    !!scoreEntryProblem(view, context) ||
    !(gate.submitsAClear || resolution.isValid || (!resolution.hasEnding && scoreIsFinished(view)));

  return { submitDisabled, submitRefusedNow: gate.refusedNow, clearDisabled: !holdsEntry(view) };
}

/** The band's headline while the card is empty over a recorded outcome, if it is in that state. */
export function clearHeadline(gate: ClearGate): 'clearRefused' | 'clearedHeadline' | undefined {
  if (gate.refusedNow) return 'clearRefused';
  if (gate.submitsAClear) return 'clearedHeadline';
  return undefined;
}

/**
 * What Submit sends, or `undefined` when it must send nothing.
 *
 * Refused for the refused removal and for an ending out of the host's scope. An emptied card submits the
 * REMOVAL of what it opened on, and says so (`{ cleared: true }`) rather than leaving a host to infer it
 * from four undefined fields. Otherwise: the ending's winner where there is one and the score's otherwise
 * — a walkover recorded against a side is an instruction, a completed score an inference — and the score
 * omitted where the ending clears it, so a host cannot store a score the card has just said is discarded.
 */
export function submission(
  view: ScoreEntryView,
  gate: ClearGate,
  context: ScoreEntryRulesContext = {},
): ScoreEntryOutcome | undefined {
  if (gate.refusedNow) return undefined;
  const resolution = resolutionInForce(view);
  if (statusOutOfScope(resolution.matchUpStatus, context.disabledMatchUpStatuses)) return undefined;
  if (gate.submitsAClear) return { cleared: true };

  return {
    matchUpStatus: resolution.matchUpStatus,
    winningSide: resolution.hasEnding ? resolution.winningSide : winningSide(view.model),
    reasonCode: view.model.ending.reasonCode,
    score: resolution.clearsScore ? undefined : scoreString(view.model),
  };
}
