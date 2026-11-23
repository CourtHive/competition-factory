import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { COMPLETED, DEFAULTED, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { CANNOT_CHANGE_OUTCOME } from '@Constants/errorConditionConstants';

/**
 * A CORRECTION KEEPS THE KIND OF OUTCOME A RECORDED RESULT FIXED (P52; CA, 2026-10-11).
 *
 * > if there is a result someone recorded in the consolation then it implies something was really played and it
 * > shouldn't be removed. the assumption is that the person who recorded the score simply didn't realize that the
 * > incorrect player had previously been advanced. therefore, changing the upstream match to a DIFFERENT KIND of
 * > outcome is invalid, but simply changing the winningSide is not invalid.
 *
 * FIRST_MATCH_LOSER_CONSOLATION 8, `propagateExitStatus`, `allowChangePropagation`. Moore beats Yates in `Main|1|3`, so
 * Yates stands in `Consolation|1|2`; the correction is always to `Main|1|4`, Yeats against Huxley, whose loser joins
 * Yates there.
 *
 * Before the change a winner FLIP relabelled the old loser's place onto the new loser and nothing re-derived the exit
 * that place should carry: flipped to a default, the default was not carried; flipped from a walkover to a played
 * result, the old walkover carry still decided `Consolation|1|2`. A status-only correction did re-derive it, so the two
 * routes to the same result left different draws. Falsified before the change: the two forward-play comparisons
 * differ on `Consolation|1|2`, and every refusal below was accepted.
 */
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const CONFIG = {
  drawType: FIRST_MATCH_LOSER_CONSOLATION,
  propagateExitStatus: true,
  participantsCount: 8,
  seed: 20460202,
  drawSize: 8,
};
type Step = [string, any];
const MOORE_BEATS_YATES: Step = ['Main|1|3', { winningSide: 1 }];

function play(drawId: string, steps: Step[]) {
  setSubscriptions({});
  expect(prepareDraw(CONFIG, drawId)).toEqual(true);
  let last: any;
  let mutated = false;
  for (const [coordinates, outcome] of steps) {
    const target = getDrawMatchUps(drawId).find((matchUp: any) => key(matchUp) === coordinates);
    expect(target, coordinates).toBeDefined();
    const before = JSON.stringify(getDrawDefinition(drawId));
    last = tournamentEngine.setMatchUpStatus({
      allowChangePropagation: true,
      propagateExitStatus: true,
      matchUpId: target.matchUpId,
      outcome,
      drawId,
    });
    mutated = JSON.stringify(getDrawDefinition(drawId)) !== before;
  }
  const matchUps = getDrawMatchUps(drawId);
  const at = (coordinates: string) => matchUps.find((matchUp: any) => key(matchUp) === coordinates);
  const integrity: any = getDrawInconsistencies({ drawDefinition: getDrawDefinition(drawId), drawId });
  return { at, last, mutated, integrity, matchUps };
}

/** every consolation matchUp: status, winner and who sits on each side */
function consolation(matchUps: any[]) {
  return Object.fromEntries(
    matchUps
      .filter((matchUp: any) => matchUp.structureName === 'Consolation')
      .map((matchUp: any) => [
        key(matchUp),
        {
          matchUpStatus: matchUp.matchUpStatus,
          winningSide: matchUp.winningSide,
          sides: (matchUp.sides ?? []).map((side: any) => side.participantId ?? (side.bye ? 'BYE' : undefined)),
        },
      ]),
  );
}

const surname = (matchUp: any, sideNumber?: number) =>
  matchUp.sides
    .find((side: any) => side.sideNumber === sideNumber)
    ?.participant?.participantName?.split(' ')
    .pop();

describe('with nothing recorded downstream, a flip re-derives the carry: corrected == forward play', () => {
  it('a played win flipped to a default carries the default, as entering the default first does', () => {
    const corrected = play('kind-flip-to-default', [
      MOORE_BEATS_YATES,
      ['Main|1|4', { winningSide: 2 }],
      ['Main|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 }],
    ]);
    expect(corrected.last.error).toBeUndefined();
    expect(corrected.integrity.valid).toEqual(true);
    const fed = corrected.at('Consolation|1|2');
    expect(fed.matchUpStatus).toEqual(DEFAULTED);
    expect(surname(fed, fed.winningSide)).toEqual('Yates');
    const correctedConsolation = consolation(corrected.matchUps);

    // each play builds its own tournament, so the corrected state was read before this replaces it
    const forward = play('kind-flip-to-default-forward', [
      MOORE_BEATS_YATES,
      ['Main|1|4', { matchUpStatus: DEFAULTED, winningSide: 1 }],
    ]);
    expect(correctedConsolation).toEqual(consolation(forward.matchUps));
  });

  it('a walkover flipped to a played win withdraws the walkover carry, as entering the played win first does', () => {
    const corrected = play('kind-flip-to-played', [
      MOORE_BEATS_YATES,
      ['Main|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['Main|1|4', { matchUpStatus: COMPLETED, winningSide: 1 }],
    ]);
    expect(corrected.last.error).toBeUndefined();
    expect(corrected.integrity.valid).toEqual(true);
    expect(corrected.at('Consolation|1|2').matchUpStatus).toEqual(TO_BE_PLAYED);
    const correctedConsolation = consolation(corrected.matchUps);

    const forward = play('kind-flip-to-played-forward', [MOORE_BEATS_YATES, ['Main|1|4', { winningSide: 1 }]]);
    expect(correctedConsolation).toEqual(consolation(forward.matchUps));
  });
});

describe('a result recorded downstream fixes the kind', () => {
  // Yeats loses Main|1|4 and then beats Yates in Consolation|1|2: a result somebody recorded
  const yeatsPlaysOn: Step[] = [
    MOORE_BEATS_YATES,
    ['Main|1|4', { winningSide: 2 }],
    ['Consolation|1|2', { winningSide: 2 }],
  ];

  it.each([
    ['a flip to a default', { matchUpStatus: DEFAULTED, winningSide: 1 }],
    ['a status-only correction to a default', { matchUpStatus: DEFAULTED, winningSide: 2 }],
  ])('refuses %s, over an untouched draw', (label, outcome) => {
    const { last, mutated, at } = play(`kind-refused-${label}`, [...yeatsPlaysOn, ['Main|1|4', outcome]]);
    expect(last.error?.code).toEqual(CANNOT_CHANGE_OUTCOME.code);
    expect(mutated).toEqual(false);
    expect(at('Consolation|1|2').matchUpStatus).toEqual(COMPLETED);
  });

  it('accepts a plain winner flip, and the recorded result becomes the new loser', () => {
    const { last, at, integrity } = play('kind-plain-flip', [...yeatsPlaysOn, ['Main|1|4', { winningSide: 1 }]]);
    expect(last.error).toBeUndefined();
    expect(integrity.valid).toEqual(true);
    const recorded = at('Consolation|1|2');
    expect(recorded.matchUpStatus).toEqual(COMPLETED);
    expect(surname(recorded, recorded.winningSide)).toEqual('Huxley');
  });

  // Huxley's walkover win over Yeats feeds Huxley's Main|2|2 loss to Consolation|2|2 (a first-match loss), and Yates,
  // who won Consolation|1|2 by Yeats's carried walkover, then plays him there: a result recorded past the carry
  const yatesPlaysOnFromTheCarry: Step[] = [
    MOORE_BEATS_YATES,
    ['Main|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }],
    ['Main|2|2', { winningSide: 1 }],
    ['Consolation|2|2', { winningSide: 1 }],
  ];

  it.each([
    ['a flip to a played win', { matchUpStatus: COMPLETED, winningSide: 1 }],
    ['a status-only correction to a played win', { matchUpStatus: COMPLETED, winningSide: 2 }],
  ])("refuses %s once the carried exit's winner has played on", (label, outcome) => {
    const setUp = play(`kind-carry-played-on-control-${label}`, yatesPlaysOnFromTheCarry);
    // CONTROL: the carry decided Consolation|1|2, and Consolation|2|2 has a recorded result
    expect(setUp.at('Consolation|1|2').matchUpStatus).toEqual(WALKOVER);
    expect(setUp.at('Consolation|2|2').winningSide).toBeDefined();

    const { last, mutated } = play(`kind-carry-played-on-${label}`, [
      ...yatesPlaysOnFromTheCarry,
      ['Main|1|4', outcome],
    ]);
    expect(last.error?.code).toEqual(CANNOT_CHANGE_OUTCOME.code);
    expect(mutated).toEqual(false);
  });
});
