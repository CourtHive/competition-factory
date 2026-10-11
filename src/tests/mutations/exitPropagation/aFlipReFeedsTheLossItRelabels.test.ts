import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DEFAULTED, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DRAW_POSITION_ACTIVE } from '@Constants/errorConditionConstants';

/**
 * A FLIP RE-FEEDS THE LATER LOSS IT RELABELS (census family F1, P48).
 *
 * FIRST_MATCH_LOSER_CONSOLATION feeds every round-1 loser, and a round-2 loser only when round 2 was their first match:
 * zero prior SCORED wins (a BYE, a walkover or an unscored default in round 1). Only the round-2 link carries that
 * condition (`FIRST_MATCHUP`). A winner change under `allowChangePropagation` relabels the old winner's path, so a
 * round-2 loss the old winner had suffered is now the old loser's — and the feed rule has to be asked about them.
 * Their first win is the flipped matchUp itself. Until this was asked, only the flipped matchUp's own loser was
 * reconciled:
 *
 * - flipped to a walkover or an unscored default, the new round-2 loser is eligible where the old winner was not,
 *   and the BYE placed for the old winner stood — `DROPPED_PROGRESSION`, 235 of run 13's 265 F1 seeds;
 * - flipped to a scored result, the new round-2 loser is ineligible where the old winner was eligible, and the
 *   relabel wrote them into the consolation — `INELIGIBLE_PROGRESSION`, 28.
 *
 * Each case is a census seed shrunk under `allowChangePropagation`. Forward play — the same final results entered
 * directly, no correction — is the reference for who stands where in the consolation. Falsified before the change:
 * the first two end with their `DROPPED_PROGRESSION` / `INELIGIBLE_PROGRESSION`; the third withdraws a played
 * consolation result and leaves its score on a TO_BE_PLAYED matchUp; the fourth stalls.
 */
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const config = (seed: number, participantsCount: number, drawSize = 8, propagateExitStatus = true) => ({
  drawType: FIRST_MATCH_LOSER_CONSOLATION,
  propagateExitStatus,
  participantsCount,
  drawSize,
  seed,
});
const RETIRED_6_3 = { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } };

type Step = [string, any];

function play(drawId: string, scenario: any, steps: Step[]) {
  setSubscriptions({});
  expect(prepareDraw(scenario, drawId)).toEqual(true);
  let last: any;
  let lastMutated = false;
  for (const [coordinates, outcome] of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === coordinates);
    expect(target, coordinates).toBeDefined();
    const before = JSON.stringify(getDrawDefinition(drawId));
    last = tournamentEngine.setMatchUpStatus({
      propagateExitStatus: scenario.propagateExitStatus,
      allowChangePropagation: true,
      matchUpId: target.matchUpId,
      outcome,
      drawId,
    });
    lastMutated = JSON.stringify(getDrawDefinition(drawId)) !== before;
  }
  const matchUps = getDrawMatchUps(drawId);
  const at = (coordinates: string) => matchUps.find((matchUp: any) => key(matchUp) === coordinates);
  const integrity: any = getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId), drawId });
  return { at, integrity, last, lastMutated };
}

/** who holds each consolation drawPosition: a participant, a BYE, or nobody */
function consolationOccupants(drawId: string) {
  const consolation = getDrawDefinition(drawId).structures.find((structure: any) => structure.structureName !== 'Main');
  return Object.fromEntries(
    consolation.positionAssignments.map((assignment: any) => [
      assignment.drawPosition,
      assignment.participantId ?? (assignment.bye ? 'BYE' : undefined),
    ]),
  );
}

/** the final results of a corrected schedule, entered once each, main structure first, round by round */
function forwardOf(steps: Step[]): Step[] {
  const finals = new Map<string, any>();
  for (const [coordinates, outcome] of steps) {
    finals.delete(coordinates);
    finals.set(coordinates, outcome);
  }
  const order = (coordinates: string) => {
    const [structureName, roundNumber] = coordinates.split('|');
    return (structureName === 'Main' ? 0 : 100) + Number(roundNumber);
  };
  return [...finals.entries()].sort(([a], [b]) => order(a) - order(b));
}

const sideOf = (matchUp: any, surname: string) =>
  matchUp?.sides?.find((side: any) => side.participant?.participantName?.endsWith(` ${surname}`));

describe('a flip re-asks the FIRST_MATCHUP feed of the round-2 loss it relabels', () => {
  it('census 20460202: a played win corrected to a default feeds its round-2 loser, as forward play does', () => {
    const scenario = config(20460202, 8);
    const steps: Step[] = [
      ['Main|1|4', { winningSide: 2 }],
      ['Main|1|3', { winningSide: 1 }],
      ['Main|2|2', { winningSide: 1 }],
      // Yeats now wins Main|1|4 by default, so the Main|2|2 loss Huxley had is Yeats's first-match loss
      ['Main|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 }],
    ];
    const { at, integrity, last } = play('reFeed-dropped', scenario, steps);
    expect(last.error).toBeUndefined();
    expect(integrity.valid).toEqual(true);
    expect(sideOf(at('Main|2|2'), 'Yeats')).toBeDefined();
    expect(sideOf(at('Consolation|2|2'), 'Yeats')).toBeDefined();

    const corrected = consolationOccupants('reFeed-dropped');
    expect(Object.values(corrected)).toContain(sideOf(at('Main|2|2'), 'Yeats').participantId);
    // each play generates its own tournament, so the corrected occupants are read before forward play replaces it
    play('reFeed-dropped-forward', scenario, forwardOf(steps));
    expect(corrected).toEqual(consolationOccupants('reFeed-dropped-forward'));
  });

  it('census 20460410: a walkover corrected to a scored win takes its round-2 loser back out, as forward play does', () => {
    const scenario = config(20460410, 7);
    const steps: Step[] = [
      ['Main|1|4', { matchUpStatus: WALKOVER, winningSide: 1 }],
      ['Main|1|4', { winningSide: 2 }],
      ['Main|1|3', { winningSide: 1 }],
      ['Main|1|4', { winningSide: 1 }],
      ['Main|1|4', { winningSide: 2 }],
      ['Main|2|2', { winningSide: 1 }],
      // Eisenstein now wins Main|1|4 by a scored retirement, so the Main|2|2 loss is not a first-match loss
      ['Main|1|4', RETIRED_6_3],
    ];
    const { at, integrity, last } = play('reFeed-ineligible', scenario, steps);
    expect(last.error).toBeUndefined();
    expect(integrity.valid).toEqual(true);
    expect(sideOf(at('Main|2|2'), 'Eisenstein')).toBeDefined();
    expect(sideOf(at('Consolation|2|2'), 'Eisenstein')).toBeUndefined();

    const corrected = consolationOccupants('reFeed-ineligible');
    expect(Object.values(corrected)).not.toContain(sideOf(at('Main|2|2'), 'Eisenstein').participantId);
    expect(Object.values(corrected)).toContain('BYE');
    // each play generates its own tournament, so the corrected occupants are read before forward play replaces it
    play('reFeed-ineligible-forward', scenario, forwardOf(steps));
    expect(corrected).toEqual(consolationOccupants('reFeed-ineligible-forward'));
  });

  it('census 20464366: refuses, over an untouched draw, a flip whose fed slot has played on', () => {
    const steps: Step[] = [
      ['Main|1|7', { winningSide: 1 }],
      ['Main|1|5', { winningSide: 2 }],
      ['Main|2|3', { winningSide: 2 }],
      ['Main|2|4', { winningSide: 2 }],
      // the BYE in Jensen's round-2 fed slot has carried Jensen on, and Jensen has won Consolation|3|2
      ['Consolation|3|2', RETIRED_6_3],
      // a walkover makes the Main|2|3 loss Jensen's first-match loss: placing Jensen would withdraw that result
      ['Main|1|5', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ];
    const { at, integrity, last, lastMutated } = play('reFeed-active', config(20464366, 11, 16, false), steps);
    expect(last.error?.code).toEqual(DRAW_POSITION_ACTIVE.code);
    expect(lastMutated).toEqual(false);
    expect(integrity.valid).toEqual(true);
    expect(at('Consolation|3|2').matchUpStatus).toEqual(RETIRED);
  });

  it('refuses, over an untouched draw, a flip whose departing round-2 loser has played on in the consolation', () => {
    const steps: Step[] = [
      ['Main|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['Main|1|3', { winningSide: 1 }],
      ['Main|2|2', { winningSide: 1 }],
      // Turing, fed by a first-match loss after a walkover win, has won Consolation|2|2
      ['Consolation|2|2', { winningSide: 1 }],
      // a scored win for Eisenstein makes the Main|2|2 loss ineligible: taking Turing's slot back would withdraw it
      ['Main|1|4', RETIRED_6_3],
    ];
    const { at, integrity, last, lastMutated } = play('reFeed-departing-active', config(20460410, 7), steps);
    expect(sideOf(at('Consolation|2|2'), 'Turing')).toBeDefined(); // control: the refusal is about Turing's slot
    expect(last.error?.code).toEqual(DRAW_POSITION_ACTIVE.code);
    expect(lastMutated).toEqual(false);
    expect(integrity.valid).toEqual(true);
    expect(at('Consolation|2|2').winningSide).toBeDefined();
  });

  it('census 20498752: the placed loser carries its own walkover into the slot it is fed, and nothing stalls', () => {
    const steps: Step[] = [
      ['Main|1|4', { winningSide: 2 }],
      ['Main|1|2', RETIRED_6_3],
      ['Main|1|3', { winningSide: 1 }],
      ['Main|2|2', { matchUpStatus: WALKOVER, winningSide: 1 }],
      ['Main|2|1', { winningSide: 1 }],
      ['Main|3|1', { matchUpStatus: DEFAULTED, winningSide: 1 }],
      // Deckard now wins Main|1|4 by walkover, so the Main|2|2 walkover he holds is his first-match loss
      ['Main|1|4', { matchUpStatus: WALKOVER, winningSide: 1 }],
    ];
    const { at, integrity, last } = play('reFeed-carry', config(20498752, 7), steps);
    expect(last.error).toBeUndefined();
    expect(integrity.valid).toEqual(true);

    // the walkover is carried from Main|2|2, the loss that fed him, into Consolation|2|2 — RULE 2 pending
    const fed = at('Consolation|2|2');
    const deckard = sideOf(fed, 'Deckard');
    expect(deckard).toBeDefined();
    expect(fed.matchUpStatus).toEqual(WALKOVER);
    expect(fed.winningSide).toEqual(3 - deckard.sideNumber);

    // and not misdirected onto the flipped matchUp's own consolation matchUp as an exit with no winner
    const flippedTarget = at('Consolation|1|2');
    expect(flippedTarget.matchUpStatus === WALKOVER && !flippedTarget.winningSide).toEqual(false);
  });
});
