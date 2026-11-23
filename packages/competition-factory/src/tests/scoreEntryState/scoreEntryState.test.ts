/**
 * The redesigned card's state model.
 *
 * The property that matters most here is a NEGATIVE one: this module must not contain a second copy
 * of the walkover rule. Every assertion about an outcome is therefore also an assertion that
 * `resolveIrregularEnding` was asked the right question — which is why the double-exit and
 * fail-closed cases are tested here even though they are tested there too. A mapping that asks the
 * wrong question produces a wrong outcome from a correct resolver, and only a test at this level
 * catches it.
 *
 * The one genuinely new piece of derivation is the side inversion: an ending is recorded against the
 * side it HAPPENED TO, and the winner is the other side. That is what lets the separate winner
 * question be deleted rather than redesigned, so it gets its own named test.
 */
import { WINNER_REQUIRING_STATUSES, NON_DIRECTING_ENDINGS, SELECTABLE_ENDINGS } from '../../scoreEntryState';
import { matchUpStatusConstants } from '@Constants/index';
import { describe, it, expect } from 'vitest';
import {
  hydrateScoreEntryState,
  emptyScoreEntryState,
  toggleBothSidesOut,
  offersBothSidesOut,
  matchEndingOptions,
  chooseMatchEnding,
  resolveScoreEntry,
  chooseSideEnding,
  chooseReasonCode,
  sideEndingOptions,
  reasonCodeStatus,
} from '../../scoreEntryState';

import type { ScoreEntryState } from '../../scoreEntryState';

const {
  RETIRED,
  WALKOVER,
  DEFAULTED,
  DOUBLE_WALKOVER,
  DOUBLE_DEFAULT,
  ABANDONED,
  CANCELLED,
  INCOMPLETE,
  SUSPENDED,
  DEAD_RUBBER,
  IN_PROGRESS,
  AWAITING_RESULT,
} = matchUpStatusConstants;

describe('the empty card', () => {
  it('resolves to nothing submittable, and says it has no ending', () => {
    const resolution = resolveScoreEntry(emptyScoreEntryState);

    expect(resolution.hasEnding).toBe(false);
    expect(resolution.isValid).toBe(false);
    expect(resolution.matchUpStatus).toBeUndefined();
    expect(resolution.winningSide).toBeUndefined();
    expect(resolution.clearsScore).toBe(false);
  });

  it('is not an error state — it is where the card opens, and it is reachable again', () => {
    // The whole reason the controls are toggles rather than a radio group. GOV.UK's objection to
    // pre-selected radios is that "nothing chosen" becomes unreachable without a reload.
    const chosen = chooseMatchEnding(emptyScoreEntryState, SUSPENDED);
    const cleared = chooseMatchEnding(chosen, SUSPENDED);

    expect(cleared.matchEnding).toBeUndefined();
    expect(resolveScoreEntry(cleared).hasEnding).toBe(false);
  });
});

describe('a side ending names the side it happened to, and the winner is the other one', () => {
  // THE test for this module. If this inversion is backwards, every walkover in the draw advances the
  // wrong participant — and the card looks perfectly correct while doing it, because the ending is
  // shown on the row the operator clicked.
  it('an ending on side 1 makes side 2 the winner', () => {
    const state = chooseSideEnding(emptyScoreEntryState, 1, WALKOVER);
    const resolution = resolveScoreEntry(state);

    expect(state.sideEnding).toEqual({ sideNumber: 1, status: WALKOVER });
    expect(resolution.matchUpStatus).toBe(WALKOVER);
    expect(resolution.winningSide).toBe(2);
    expect(resolution.isValid).toBe(true);
  });

  it('an ending on side 2 makes side 1 the winner', () => {
    const resolution = resolveScoreEntry(chooseSideEnding(emptyScoreEntryState, 2, WALKOVER));

    expect(resolution.winningSide).toBe(1);
    expect(resolution.isValid).toBe(true);
  });

  it.each([RETIRED, WALKOVER, DEFAULTED])('%s resolves with a winner and never awaits one', (status) => {
    // The old dialog's fail-closed `awaitingWinner` state cannot occur in this shape: choosing the
    // ending on a row answers the winner question in the same act. That is the design's claim, and
    // this is what makes it true rather than asserted.
    const resolution = resolveScoreEntry(chooseSideEnding(emptyScoreEntryState, 1, status));

    expect(resolution.matchUpStatus).toBe(status);
    expect(resolution.winningSide).toBe(2);
    expect(resolution.awaitingWinner).toBe(false);
    expect(resolution.isValid).toBe(true);
  });

  it('offers exactly the three winner-requiring endings, in vocabulary order', () => {
    expect(sideEndingOptions()).toEqual([RETIRED, WALKOVER, DEFAULTED]);
  });
});

describe('"did not appear either" turns a side ending into a double exit', () => {
  it.each([
    [WALKOVER, DOUBLE_WALKOVER],
    [DEFAULTED, DOUBLE_DEFAULT],
  ])('%s becomes %s and advances nobody', (ending, expected) => {
    const state = toggleBothSidesOut(chooseSideEnding(emptyScoreEntryState, 1, ending));
    const resolution = resolveScoreEntry(state);

    expect(resolution.matchUpStatus).toBe(expected);
    expect(resolution.winningSide).toBeUndefined();
    expect(resolution.isDoubleExit).toBe(true);
    expect(resolution.isValid).toBe(true);
  });

  it('is refused for a retirement, which has no double form', () => {
    // The factory has no double-retirement status. Two players who both fail to finish are a double
    // default or a double walkover depending on why — the operator's distinction, not an inferable
    // one. The state is returned unchanged rather than holding a flag that cannot resolve.
    const state = chooseSideEnding(emptyScoreEntryState, 1, RETIRED);

    expect(toggleBothSidesOut(state)).toBe(state);
    expect(offersBothSidesOut(state)).toBe(false);
    expect(resolveScoreEntry(state).winningSide).toBe(2);
  });

  it('is refused when no side ending is selected', () => {
    expect(toggleBothSidesOut(emptyScoreEntryState)).toBe(emptyScoreEntryState);
    expect(offersBothSidesOut(emptyScoreEntryState)).toBe(false);
  });

  it.each([WALKOVER, DEFAULTED])('is offered for %s', (status) => {
    expect(offersBothSidesOut(chooseSideEnding(emptyScoreEntryState, 1, status))).toBe(true);
  });

  it('toggles back off, restoring the single winner', () => {
    const on = toggleBothSidesOut(chooseSideEnding(emptyScoreEntryState, 2, WALKOVER));
    const off = toggleBothSidesOut(on);

    expect(resolveScoreEntry(on).winningSide).toBeUndefined();
    expect(resolveScoreEntry(off).winningSide).toBe(1);
    expect(resolveScoreEntry(off).isDoubleExit).toBe(false);
  });
});

describe('a match-level ending resolves nobody and needs no second answer', () => {
  it.each([...NON_DIRECTING_ENDINGS])('%s is valid the moment it is chosen', (status) => {
    const resolution = resolveScoreEntry(chooseMatchEnding(emptyScoreEntryState, status));

    expect(resolution.matchUpStatus).toBe(status);
    expect(resolution.winningSide).toBeUndefined();
    expect(resolution.awaitingWinner).toBe(false);
    expect(resolution.isValid).toBe(true);
  });

  it('offers exactly the seven non-directing endings, in vocabulary order', () => {
    expect(matchEndingOptions()).toEqual([
      IN_PROGRESS,
      AWAITING_RESULT,
      SUSPENDED,
      ABANDONED,
      CANCELLED,
      INCOMPLETE,
      DEAD_RUBBER,
    ]);
  });

  it('the two groups partition the vocabulary — nothing offered twice, nothing unreachable', () => {
    // The card offers endings in two places, so the risk is a status appearing in both or neither.
    const side = sideEndingOptions();
    const match = matchEndingOptions();

    expect(side.filter((s) => match.includes(s))).toEqual([]);
    expect([...side, ...match].toSorted((a, b) => a.localeCompare(b, 'en'))).toEqual(
      [...SELECTABLE_ENDINGS].toSorted((a, b) => a.localeCompare(b, 'en')),
    );
    expect(side.every((s) => WINNER_REQUIRING_STATUSES.has(s))).toBe(true);
    expect(match.every((s) => NON_DIRECTING_ENDINGS.has(s))).toBe(true);
  });
});

describe('the two ending groups are mutually exclusive', () => {
  it('choosing a match ending clears a side ending', () => {
    const state = chooseMatchEnding(chooseSideEnding(emptyScoreEntryState, 1, WALKOVER), SUSPENDED);

    expect(state.sideEnding).toBeUndefined();
    expect(state.matchEnding).toBe(SUSPENDED);
    expect(resolveScoreEntry(state).winningSide).toBeUndefined();
  });

  it('choosing a side ending clears a match ending', () => {
    const state = chooseSideEnding(chooseMatchEnding(emptyScoreEntryState, SUSPENDED), 2, RETIRED);

    expect(state.matchEnding).toBeUndefined();
    expect(state.sideEnding).toEqual({ sideNumber: 2, status: RETIRED });
    expect(resolveScoreEntry(state).winningSide).toBe(1);
  });

  it('never holds both, so the resolver is never handed two answers', () => {
    // Allowing both would make the outcome depend on which one `reasonCodeStatus` reads first — a
    // silent dependency on statement order for the most consequential field in the dialog.
    const states: ScoreEntryState[] = [
      chooseSideEnding(emptyScoreEntryState, 1, WALKOVER),
      chooseMatchEnding(emptyScoreEntryState, CANCELLED),
      chooseMatchEnding(chooseSideEnding(emptyScoreEntryState, 1, WALKOVER), CANCELLED),
      chooseSideEnding(chooseMatchEnding(emptyScoreEntryState, CANCELLED), 1, WALKOVER),
    ];

    for (const state of states) {
      expect(!!state.sideEnding && !!state.matchEnding).toBe(false);
    }
  });
});

describe('every control is a toggle', () => {
  it('re-choosing the same ending on the same side clears it', () => {
    const on = chooseSideEnding(emptyScoreEntryState, 1, WALKOVER);
    const off = chooseSideEnding(on, 1, WALKOVER);

    expect(off.sideEnding).toBeUndefined();
  });

  it('the same ending on the OTHER side moves it rather than clearing it', () => {
    // The case a naive "same status?" check gets wrong, and it matters: it is the difference between
    // recording that the other player walked over and recording nothing at all.
    const moved = chooseSideEnding(chooseSideEnding(emptyScoreEntryState, 1, WALKOVER), 2, WALKOVER);

    expect(moved.sideEnding).toEqual({ sideNumber: 2, status: WALKOVER });
    expect(resolveScoreEntry(moved).winningSide).toBe(1);
  });

  it('a different ending on the same side replaces it', () => {
    const changed = chooseSideEnding(chooseSideEnding(emptyScoreEntryState, 1, WALKOVER), 1, RETIRED);

    expect(changed.sideEnding).toEqual({ sideNumber: 1, status: RETIRED });
  });

  it('clearing a side ending also drops its double-exit answer', () => {
    // Otherwise a stale `bothSidesOut` survives to qualify whatever ending is chosen next, which is
    // how a walkover picks up a "neither advanced" the operator answered about a different ending.
    const doubled = toggleBothSidesOut(chooseSideEnding(emptyScoreEntryState, 1, WALKOVER));
    const cleared = chooseSideEnding(doubled, 1, WALKOVER);

    expect(doubled.bothSidesOut).toBe(true);
    expect(cleared.bothSidesOut).toBeUndefined();
  });

  it('changing the ending drops it too', () => {
    const doubled = toggleBothSidesOut(chooseSideEnding(emptyScoreEntryState, 1, WALKOVER));
    const changed = chooseSideEnding(doubled, 1, DEFAULTED);

    expect(changed.bothSidesOut).toBeUndefined();
    expect(resolveScoreEntry(changed).matchUpStatus).toBe(DEFAULTED);
    expect(resolveScoreEntry(changed).isDoubleExit).toBe(false);
  });
});

describe('the reason code belongs to the ending it was chosen for', () => {
  it('comes from the selected ending, whichever group it is in', () => {
    expect(reasonCodeStatus(emptyScoreEntryState)).toBeUndefined();
    expect(reasonCodeStatus(chooseSideEnding(emptyScoreEntryState, 1, RETIRED))).toBe(RETIRED);
    expect(reasonCodeStatus(chooseMatchEnding(emptyScoreEntryState, ABANDONED))).toBe(ABANDONED);
  });

  it('is dropped when the ending changes', () => {
    // A reason chosen for a retirement is not a reason for a walkover — the codes come from different
    // policy groups entirely. Carrying it across would submit a code the operator never chose for the
    // ending it ends up attached to, and the picker would look consistent while doing it.
    const withReason = chooseReasonCode(chooseSideEnding(emptyScoreEntryState, 1, RETIRED), 'RJ');

    expect(withReason.reasonCode).toBe('RJ');
    expect(chooseSideEnding(withReason, 1, WALKOVER).reasonCode).toBeUndefined();
    expect(chooseMatchEnding(withReason, ABANDONED).reasonCode).toBeUndefined();
    expect(chooseSideEnding(withReason, 1, RETIRED).reasonCode).toBeUndefined();
  });

  it('toggles off when re-chosen', () => {
    const withReason = chooseReasonCode(chooseSideEnding(emptyScoreEntryState, 1, RETIRED), 'RJ');

    expect(chooseReasonCode(withReason, 'RJ').reasonCode).toBeUndefined();
    expect(chooseReasonCode(withReason, 'RI').reasonCode).toBe('RI');
  });
});

describe('which endings discard a typed score', () => {
  it.each([WALKOVER])('a side %s clears the score', (status) => {
    expect(resolveScoreEntry(chooseSideEnding(emptyScoreEntryState, 1, status)).clearsScore).toBe(true);
  });

  it.each([RETIRED, DEFAULTED])('a side %s keeps it — the match was partly played', (status) => {
    expect(resolveScoreEntry(chooseSideEnding(emptyScoreEntryState, 1, status)).clearsScore).toBe(false);
  });

  it.each([CANCELLED, DEAD_RUBBER])('%s clears it — CA, 2026-09-27', (status) => {
    expect(resolveScoreEntry(chooseMatchEnding(emptyScoreEntryState, status)).clearsScore).toBe(true);
  });

  it.each([ABANDONED, INCOMPLETE, SUSPENDED, IN_PROGRESS, AWAITING_RESULT])(
    '%s keeps it — the partial score is the content of the result',
    (status) => {
      expect(resolveScoreEntry(chooseMatchEnding(emptyScoreEntryState, status)).clearsScore).toBe(false);
    },
  );

  it('a double walkover clears the score, like the walkover it came from', () => {
    // ── This test does NOT discriminate between two implementations, and says so ──
    //
    // `clearsScore` is computed from the RESOLVED status rather than the clicked ending, which is
    // correct in principle: `NO_SCORE_STATUSES` is written against resolved statuses (it holds
    // DOUBLE_WALKOVER, which is never something an operator clicks). But it currently holds BOTH
    // members of each pair, so reading the clicked ending gives the same answer everywhere in the
    // present vocabulary — falsified by planting it, and no test failed.
    //
    // Recorded rather than dressed up as coverage. The reason to keep reading the resolved status is
    // that it stays correct the first time a double form and its base disagree about scores; there is
    // no case today that can prove it, and claiming otherwise would be a vacuous assertion.
    const doubled = toggleBothSidesOut(chooseSideEnding(emptyScoreEntryState, 1, WALKOVER));
    const resolution = resolveScoreEntry(doubled);

    expect(resolution.matchUpStatus).toBe(DOUBLE_WALKOVER);
    expect(resolution.clearsScore).toBe(true);
  });

  it('a double default keeps the score, as a single default does', () => {
    const doubled = toggleBothSidesOut(chooseSideEnding(emptyScoreEntryState, 1, DEFAULTED));
    const resolution = resolveScoreEntry(doubled);

    expect(resolution.matchUpStatus).toBe(DOUBLE_DEFAULT);
    expect(resolution.clearsScore).toBe(false);
  });
});

describe('no transition mutates the state it was given', () => {
  // The card holds one state object per render. A mutating transition would make the second click
  // read the first one's result, which is the class of bug that only shows up under fast input.
  it.each([
    ['chooseSideEnding', (s: ScoreEntryState) => chooseSideEnding(s, 2, RETIRED)],
    ['chooseMatchEnding', (s: ScoreEntryState) => chooseMatchEnding(s, CANCELLED)],
    ['toggleBothSidesOut', (s: ScoreEntryState) => toggleBothSidesOut(s)],
    ['chooseReasonCode', (s: ScoreEntryState) => chooseReasonCode(s, 'W1')],
  ])('%s leaves the input untouched', (_label, transition) => {
    const before: ScoreEntryState = {
      sideEnding: { sideNumber: 1, status: WALKOVER },
      bothSidesOut: true,
      reasonCode: 'W1',
    };
    // `structuredClone`, not a JSON round-trip: this state carries `undefined` values deliberately
    // (unanswered is not the same as absent), and JSON would drop them — weakening the very
    // comparison this test exists to make. The repo's lint rule says so and is right.
    const snapshot = structuredClone(before);

    transition(before);

    expect(before).toEqual(snapshot);
  });
});

/**
 * Reopening a recorded outcome.
 *
 * CA, 2026-09-28: *"we need to be able to open existing outcomes!"* The dialog opened blank on a scored
 * matchUp, and the shipping modal does not — so swapping the card in without this would have lost the
 * display of every outcome already entered.
 *
 * The inversion is the thing to hold: a stored matchUp names the WINNER, and this card records the side
 * the ending HAPPENED TO. Every case below is that mapping run backwards.
 */
describe('hydrateScoreEntryState', () => {
  it('records a single exit against the side that did NOT win', () => {
    // `winningSide: 1` means side 2 walked over.
    expect(hydrateScoreEntryState({ matchUpStatus: WALKOVER, winningSide: 1 })).toEqual({
      sideEnding: { sideNumber: 2, status: WALKOVER },
      reasonCode: undefined,
    });

    expect(hydrateScoreEntryState({ matchUpStatus: RETIRED, winningSide: 2 })).toEqual({
      sideEnding: { sideNumber: 1, status: RETIRED },
      reasonCode: undefined,
    });
  });

  it('round-trips through resolveScoreEntry to the SAME winner', () => {
    // The property that matters, asserted rather than trusted: hydrate a stored winner, resolve the
    // state, and the winner must come back unchanged. An inversion applied once too often or not at all
    // advances the wrong participant, and every intermediate value still looks plausible.
    for (const winningSide of [1, 2]) {
      for (const status of [WALKOVER, RETIRED, DEFAULTED]) {
        const state = hydrateScoreEntryState({ matchUpStatus: status, winningSide });
        expect(resolveScoreEntry(state).winningSide, `${status} won by ${winningSide}`).toBe(winningSide);
      }
    }
  });

  it('marks a DOUBLE exit on both sides, and resolves to neither', () => {
    // The stored status is `DOUBLE_WALKOVER`; the ending an operator clicks is `WALKOVER` plus the
    // both-sides flag. `sideNumber` is arbitrary here and decides nothing — the card draws the pill on
    // both rows, and the resolution is NEITHER_SIDE.
    const state = hydrateScoreEntryState({ matchUpStatus: DOUBLE_WALKOVER });

    expect(state.bothSidesOut).toBe(true);
    expect(state.sideEnding?.status).toBe(WALKOVER);
    expect(resolveScoreEntry(state).winningSide).toBeUndefined();
    expect(resolveScoreEntry(state).matchUpStatus).toBe(DOUBLE_WALKOVER);
  });

  it('records an ending that resolves NOBODY at match level', () => {
    // There is no side to attach it to, which is what the match-level slot is for.
    expect(hydrateScoreEntryState({ matchUpStatus: SUSPENDED })).toEqual({
      matchEnding: SUSPENDED,
      reasonCode: undefined,
    });
  });

  it('carries the reason code, read from the side that owns it', () => {
    expect(
      hydrateScoreEntryState({ matchUpStatus: WALKOVER, winningSide: 1, sideStatusCodes: { 2: 'W1' } }).reasonCode,
    ).toBe('W1');

    // The positional fallback, for records written before `sideStatusCodes` existed.
    expect(
      hydrateScoreEntryState({ matchUpStatus: WALKOVER, winningSide: 1, matchUpStatusCodes: ['W1'] }).reasonCode,
    ).toBe('W1');
  });

  it('is EMPTY for a played-out match, which has no ending at all', () => {
    expect(hydrateScoreEntryState({ matchUpStatus: 'COMPLETED', winningSide: 1 })).toEqual(emptyScoreEntryState);
    expect(hydrateScoreEntryState({})).toEqual(emptyScoreEntryState);
    expect(hydrateScoreEntryState()).toEqual(emptyScoreEntryState);
  });

  it('REFUSES a winner-requiring status with no winning side, rather than guessing a placement', () => {
    // A corrupt record: a walkover always stores a winner. Placing it on a guessed side would silently
    // advance a participant, so the card opens inert instead — the same choice `hydrateIrregularEnding`
    // makes for an unmapped double exit.
    expect(hydrateScoreEntryState({ matchUpStatus: WALKOVER })).toEqual(emptyScoreEntryState);
  });
});
