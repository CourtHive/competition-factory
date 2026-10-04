import { finalSetGoverns } from '@Helpers/matchUpFormatCode/aggregateDecider';
import { validateSetScore } from '@Validators/validateMatchUpScore';
import { parse } from '@Helpers/matchUpFormatCode/parse';

import type { Set } from '@Types/tournamentTypes';

/**
 * What survives a change of `matchUpFormat`, and what has to go.
 *
 * ── Why this exists ──
 *
 * A scoring interface that clears the whole score whenever the format changes throws away work the
 * change did not touch. CA, 2026-09-28: *"There are situations where someone starts entering sets and
 * then realizes that the third set is a tiebreak set and changes from SET3-S:6/TB7 to
 * SET3-S:6NOAD/TB7-F:TB10 => obviously the first two sets don't need to change at all in this
 * scenario! But if a partial 3rd set was entered it would need to be trimmed away."*
 *
 * ── The rule, per set, in order ──
 *
 * 1. Past the new format's set count, the set is gone — there is no position for it.
 * 2. If the set's FORMAT at that position is unchanged, the set is kept exactly as it is, finished or
 *    part-entered. Nothing about it was invalidated, so nothing about it is anyone's business.
 * 3. Otherwise the set must stand as a COMPLETE, legal set under the new format, or it goes.
 *
 * and then: **everything after the first casualty goes with it.** A score is a sequence — keeping the
 * third set having dropped the second would renumber it into a claim nobody made.
 *
 * ── Three decisions CA took, recorded because each has a tempting alternative ──
 *
 * **Only what the new format invalidates is trimmed** (rule 2). The obvious simplification is to drop
 * every part-entered trailing set, which would also satisfy CA's example — and would throw away a
 * half-typed set when the operator corrected something that had nothing to do with it.
 *
 * **A set is kept or dropped WHOLE.** CA, 2026-09-29, asked directly: a 7-6 whose tiebreak the new
 * format has resized keeps neither half. Trimming to the games alone would leave a 7-6 with unknown
 * points, which is exactly the unfinished state, and would reopen an interface mid-tiebreak.
 *
 * **Nothing is ever rescaled.** A 10-8 match tiebreak becoming a `TB7` is discarded, never rewritten
 * as 7-5. Inventing a score is worse than clearing one, and a score nobody played is not evidence.
 *
 * ── What it does NOT decide ──
 *
 * Whether to warn, ask, or proceed silently. That is the caller's, and it is why `discarded` and
 * `reason` are returned rather than only the survivors: an interface has to be able to say WHICH score
 * it is about to throw away, in the operator's own numbers.
 */

export type RetainScoreArgs = {
  /** The sets entered so far, in set order. */
  sets?: Set[];
  /** The format being moved TO. */
  matchUpFormat?: string;
  /**
   * The format being moved FROM.
   *
   * Optional, and the difference is rule 2 above: without it there is no way to know that a set's
   * format is unchanged, so a part-entered set cannot be told from one the change invalidated, and
   * every incomplete set is dropped. Pass it whenever it is known.
   */
  previousMatchUpFormat?: string;
};

export type RetainedScore = {
  /** The sets that survive, in order and untouched. */
  sets: Set[];
  /** The sets that do not, so a caller can say what is being lost. */
  discarded: Set[];
  /** Why the FIRST casualty failed, in the validator's own words, where it had something to say. */
  reason?: string;
  /** Nothing was discarded — the format change costs the operator nothing. */
  unchanged: boolean;
};

/** The set count a format plays: every set for an `exactly` format, otherwise the best-of. */
function setCountOf(parsed: any): number | undefined {
  return parsed?.exactly ?? parsed?.bestOf;
}

/**
 * The format governing one set position, with the deciding-set rule applied.
 *
 * The deciding set is the LAST one the format plays, so it moves when the set count does — a third
 * set is an ordinary set under `SET5` and the decider under `SET3`, and can change shape without
 * anyone editing it. That is why the position is resolved against each format separately.
 */
function setFormatAt(parsed: any, index: number): any {
  if (!parsed) return undefined;
  const count = setCountOf(parsed);
  const isDeciding = count !== undefined && index === count - 1;
  return (isDeciding && parsed.finalSetFormat) || parsed.setFormat;
}

/**
 * Whether two set formats are the same rule.
 *
 * A structural comparison of the parsed objects. They come from the same parser over the same
 * grammar, so two formats that mean the same thing serialise the same way — which is what makes
 * comparing them honest rather than a list of fields someone has to remember to extend.
 */
function sameSetFormat(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function retainScoreForFormat(params?: RetainScoreArgs): RetainedScore {
  const { sets, matchUpFormat, previousMatchUpFormat } = params ?? {};
  const ordered = Array.isArray(sets) ? sets : [];

  // No format to judge against: nothing can be shown to be invalid, so nothing is taken away.
  const parsed = matchUpFormat ? parse(matchUpFormat) : undefined;
  if (!parsed) return { sets: ordered, discarded: [], unchanged: true };

  const previous = previousMatchUpFormat ? parse(previousMatchUpFormat) : undefined;
  const count = setCountOf(parsed);

  const retained: Set[] = [];
  let reason: string | undefined;

  for (const [index, set] of ordered.entries()) {
    if (count !== undefined && index >= count) {
      reason ??= `set ${index + 1} is beyond the ${count} this format plays`;
      break;
    }

    // Rule 2: the position's rule has not changed, so neither has what is legal in it.
    if (sameSetFormat(setFormatAt(previous, index), setFormatAt(parsed, index))) {
      retained.push(set);
      continue;
    }

    const isDecidingSet = finalSetGoverns(parsed, index + 1, count !== undefined && index === count - 1);
    // `allowIncomplete: false` deliberately: where the rule DID change, a part-entered set has no
    // claim to survive it — the values were typed against a question that is no longer being asked.
    const { isValid, error } = validateSetScore(set, matchUpFormat, isDecidingSet, false);
    if (!isValid) {
      reason ??= error;
      break;
    }

    retained.push(set);
  }

  const discarded = ordered.slice(retained.length);

  return {
    sets: retained,
    discarded,
    reason: discarded.length ? reason : undefined,
    unchanged: !discarded.length,
  };
}
