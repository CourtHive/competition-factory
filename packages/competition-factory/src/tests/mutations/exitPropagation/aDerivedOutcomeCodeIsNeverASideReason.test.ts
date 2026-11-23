import { PRODUCED_EXIT_POLICY } from '@Tests/testHarness/exitPropagation/producedExitPolicy';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A REASON IS ATTRIBUTED BY WHERE IT CAME FROM, NOT BY WHAT IT SAYS (census A1 residue F1b, 2026-10-18).
 *
 * `sideStatusCodes` holds the scoring policy's reason per side (`{ 2: 'DM' }`). `splitStatusCodes` builds it
 * from the positional `matchUpStatusCodes` a CLIENT submits. Two engine writers, `progressExitStatus` and the
 * convergence reconcile in `doubleExitAdvancement`, sent their own array through that same split, and their
 * array is `deriveStatusCodes`' display projection of provenance: a side that exited with no recorded reason
 * shows the bare outcome code, `['DEF']`, `['WO']`. Split, those became reasons.
 *
 * Measured before the change on FIRST_MATCH_LOSER_CONSOLATION 32, the consolation matchUp the two first-round
 * losers meet in:
 *
 * | entered | consolation | `sideStatusCodes` |
 * |---|---|---|
 * | DOUBLE_DEFAULT, then DEFAULTED | DOUBLE_DEFAULT | `{ 1: 'DEF', 2: 'DEF' }` |
 * | DEFAULTED, then DOUBLE_DEFAULT | DOUBLE_DEFAULT | none |
 * | DOUBLE_WALKOVER, then WALKOVER | DOUBLE_WALKOVER | `{ 1: 'WO', 2: 'WO' }` |
 * | DOUBLE_WALKOVER `WOWO`, then DEFAULTED `DM` | DOUBLE_WALKOVER | `{ 1: 'WO', 2: 'DM' }` |
 *
 * The same results in two orders left two draws, and one bare code covered both sides of a double exit.
 *
 * An engine write whose array is derived now says so (`derivedStatusCodes`) and keeps only real reasons:
 * those the matchUp retains and the source's own side-keyed reason. A client's array is split as before, and
 * no code is reserved by value — a client's `['WO']` is still its reason.
 */

function scenario(drawId: string, steps: [string, any][]) {
  mocksEngine.generateTournamentRecord({
    policyDefinitions: PRODUCED_EXIT_POLICY,
    drawProfiles: [{ drawId, drawSize: 32, drawType: FIRST_MATCH_LOSER_CONSOLATION, idPrefix: 'matchUp' }],
    setState: true,
  });
  for (const [matchUpId, outcome] of steps) {
    const result: any = tournamentEngine.setMatchUpStatus({ propagateExitStatus: true, matchUpId, outcome, drawId });
    expect(result.success, `${matchUpId} ${outcome.matchUpStatus}`).toEqual(true);
  }
  const matchUps: any[] = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
  const byId = (matchUpId: string) => matchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
  // the consolation matchUp both first-round losers are sent to
  const consolation = byId(byId('matchUp-1-2')?.loserMatchUpId);
  return { byId, consolation };
}

it.each([
  {
    label: 'DOUBLE_DEFAULT, then DEFAULTED',
    steps: [
      ['matchUp-1-1', { matchUpStatus: DOUBLE_DEFAULT }],
      ['matchUp-1-2', { matchUpStatus: DEFAULTED, winningSide: 1 }],
    ],
    status: DOUBLE_DEFAULT,
    display: 'DEF',
  },
  {
    label: 'DEFAULTED, then DOUBLE_DEFAULT',
    steps: [
      ['matchUp-1-2', { matchUpStatus: DEFAULTED, winningSide: 1 }],
      ['matchUp-1-1', { matchUpStatus: DOUBLE_DEFAULT }],
    ],
    status: DOUBLE_DEFAULT,
  },
  {
    label: 'DOUBLE_WALKOVER, then WALKOVER',
    steps: [
      ['matchUp-1-1', { matchUpStatus: DOUBLE_WALKOVER }],
      ['matchUp-1-2', { matchUpStatus: WALKOVER, winningSide: 2 }],
    ],
    status: DOUBLE_WALKOVER,
    display: 'WO',
  },
  {
    label: 'WALKOVER, then DOUBLE_WALKOVER',
    steps: [
      ['matchUp-1-2', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['matchUp-1-1', { matchUpStatus: DOUBLE_WALKOVER }],
    ],
    status: DOUBLE_WALKOVER,
  },
] as const)('a derived outcome code is never a side reason: $label', ({ steps, status, display }) => {
  const { consolation } = scenario(`derived-${status}-${steps[0][0]}`, steps as any);

  // CONTROL: the convergence under test happened, and where the derived display is written it is there
  expect(consolation?.matchUpStatus).toEqual(status);
  if (display) expect(consolation?.matchUpStatusCodes, 'the display keeps its outcome code').toContain(display);

  // nobody gave a reason, in either order, so no side carries one
  expect(consolation?.sideStatusCodes, 'no derived code is filed as a reason').toBeUndefined();
  expect(consolation?.matchUpStatusCode).toBeUndefined();
});

it('a real reason carried through propagation stays on the side it arrived at, and only there', () => {
  const { byId, consolation } = scenario('carried-DM', [
    ['matchUp-1-1', { matchUpStatus: DOUBLE_WALKOVER, matchUpStatusCodes: ['WOWO', 'WOWO'] }],
    ['matchUp-1-2', { matchUpStatus: DEFAULTED, winningSide: 1, matchUpStatusCodes: ['', 'DM'] }],
  ]);

  // CONTROL: the source split its client array as it always has, and the consolation converged
  expect(byId('matchUp-1-2')?.sideStatusCodes).toEqual({ 2: 'DM' });
  expect(consolation?.matchUpStatus).toEqual(DOUBLE_WALKOVER);

  const arrival: any = Object.entries(consolation?.sideExitProvenance ?? {}).find(
    ([, entry]: any) => entry?.sourceMatchUpId === 'matchUp-1-2',
  );
  expect(arrival, 'the arriving exit is attributed to a side').toBeDefined();
  const arrivingSide = Number(arrival[0]);

  // the reason rides with the side it arrived at; the other side's derived `WO` is display, not a reason
  expect(consolation?.sideStatusCodes).toEqual({ [arrivingSide]: 'DM' });
  expect(consolation?.matchUpStatusCodes?.[arrivingSide - 1], 'and is displayed at that side').toEqual('DM');
  expect(consolation?.matchUpStatusCodes?.[2 - arrivingSide], 'the other side displays its outcome').toEqual('WO');
});

it.each([
  {
    label: "a lone code on a double exit covers both sides — a client's `['WO']` is its own reason",
    outcome: { matchUpStatus: DOUBLE_WALKOVER, matchUpStatusCodes: ['WO'] },
    expected: { 1: 'WO', 2: 'WO' },
  },
  {
    label: 'a single exit files the code against the side that did not win, whatever its index',
    outcome: { matchUpStatus: DEFAULTED, winningSide: 1, matchUpStatusCodes: ['DM'] },
    expected: { 2: 'DM' },
  },
  {
    label: "a client's bare outcome code is not reserved by value",
    outcome: { matchUpStatus: DEFAULTED, winningSide: 1, matchUpStatusCodes: ['', 'DEF'] },
    expected: { 2: 'DEF' },
  },
])('a client-submitted array is split as before: $label', ({ outcome, expected }) => {
  const { byId } = scenario(`client-${outcome.matchUpStatus}-${expected[2]}`, [['matchUp-1-1', outcome]]);
  const scored = byId('matchUp-1-1');
  expect(scored?.matchUpStatusCodes, 'the submitted array is stored as submitted').toEqual(outcome.matchUpStatusCodes);
  expect(scored?.sideStatusCodes).toEqual(expected);
});
