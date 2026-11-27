import { PRODUCED_EXIT_POLICY } from '@Tests/testHarness/exitPropagation/producedExitPolicy';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A REASON IS ATTRIBUTED BY WHERE IT CAME FROM, NOT BY WHAT IT SAYS.
 *
 * `sideStatusCodes` holds the scoring policy's reason per side (`{ 2: 'DM' }`), as a client submits it. An engine
 * write that propagates or converges an exit keeps only real reasons: those the matchUp already holds and the
 * source's own side-keyed reason. A bare outcome code (`DEF`, `WO`) is never filed as a reason, in either entry order,
 * and nothing writes a positional array. A client's own reason is stored as given, whatever its value: no code is
 * reserved by value.
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
  },
  {
    label: 'WALKOVER, then DOUBLE_WALKOVER',
    steps: [
      ['matchUp-1-2', { matchUpStatus: WALKOVER, winningSide: 2 }],
      ['matchUp-1-1', { matchUpStatus: DOUBLE_WALKOVER }],
    ],
    status: DOUBLE_WALKOVER,
  },
] as const)('a derived outcome code is never a side reason: $label', ({ steps, status }) => {
  const { consolation } = scenario(`derived-${status}-${steps[0][0]}`, steps as any);

  // CONTROL: the convergence under test happened
  expect(consolation?.matchUpStatus).toEqual(status);
  expect(consolation?.matchUpStatusCodes).toBeUndefined();

  // nobody gave a reason, in either order, so no side carries one
  expect(consolation?.sideStatusCodes, 'no derived code is filed as a reason').toBeUndefined();
  expect(consolation?.matchUpStatusCode).toBeUndefined();
});

it('a real reason carried through propagation stays on the side it arrived at, and only there', () => {
  const { byId, consolation } = scenario('carried-DM', [
    ['matchUp-1-1', { matchUpStatus: DOUBLE_WALKOVER, sideStatusCodes: { 1: 'WOWO', 2: 'WOWO' } }],
    ['matchUp-1-2', { matchUpStatus: DEFAULTED, winningSide: 1, sideStatusCodes: { 2: 'DM' } }],
  ]);

  // CONTROL: the source stored its client reason, and the consolation converged
  expect(byId('matchUp-1-2')?.sideStatusCodes).toEqual({ 2: 'DM' });
  expect(consolation?.matchUpStatus).toEqual(DOUBLE_WALKOVER);

  const arrival: any = Object.entries(consolation?.sideExitProvenance ?? {}).find(
    ([, entry]: any) => entry?.sourceMatchUpId === 'matchUp-1-2',
  );
  expect(arrival, 'the arriving exit is attributed to a side').toBeDefined();
  const arrivingSide = Number(arrival[0]);

  // the reason rides with the side it arrived at; the other side gave none
  expect(consolation?.sideStatusCodes).toEqual({ [arrivingSide]: 'DM' });
  expect(consolation?.matchUpStatusCodes).toBeUndefined();
});

it.each([
  {
    label: "a double exit's reason on both sides — a client's `WO` is its own reason",
    outcome: { matchUpStatus: DOUBLE_WALKOVER, sideStatusCodes: { 1: 'WO', 2: 'WO' } },
    expected: { 1: 'WO', 2: 'WO' },
  },
  {
    label: 'a single exit files the reason against the side that did not win',
    outcome: { matchUpStatus: DEFAULTED, winningSide: 1, sideStatusCodes: { 2: 'DM' } },
    expected: { 2: 'DM' },
  },
  {
    label: "a client's bare outcome code is not reserved by value",
    outcome: { matchUpStatus: DEFAULTED, winningSide: 1, sideStatusCodes: { 2: 'DEF' } },
    expected: { 2: 'DEF' },
  },
  {
    label: 'a reason submitted for the winner of a single exit is not stored',
    outcome: { matchUpStatus: DEFAULTED, winningSide: 1, sideStatusCodes: { 1: 'DM' } },
    expected: undefined,
  },
])('a client-submitted reason is stored keyed: $label', ({ outcome, expected }) => {
  const { byId } = scenario(`client-${outcome.matchUpStatus}-${JSON.stringify(outcome.sideStatusCodes)}`, [
    ['matchUp-1-1', outcome],
  ]);
  const scored = byId('matchUp-1-1');
  expect(scored?.matchUpStatusCodes).toBeUndefined();
  expect(scored?.sideStatusCodes).toEqual(expected);
});

it('refuses the positional array of earlier versions before anything is written', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawId: 'refused', drawSize: 4, idPrefix: 'm' }],
    setState: true,
  });
  const before = JSON.stringify(tournamentEngine.getTournament().tournamentRecord);
  const result: any = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DEFAULTED, winningSide: 1, matchUpStatusCodes: ['', 'DM'] },
    matchUpId: 'm-1-1',
    drawId: 'refused',
  });
  expect(result.error?.code).toEqual('ERR_INVALID_VALUES');
  expect(JSON.stringify(tournamentEngine.getTournament().tournamentRecord)).toEqual(before);
});
