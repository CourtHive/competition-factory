import { PRODUCED_EXIT_POLICY } from '@Tests/testHarness/exitPropagation/producedExitPolicy';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { fixtures } from '@Fixtures/index';
import { expect, test } from 'vitest';

// constants
import { FIRST_ROUND_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, WALKOVER, BYE } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';

/**
 * `POLICY_PROGRESSION_USTA`: a double walkover produces a WALKOVER in BOTH structures.
 *
 * CA, 2026-10-22, confirmed with USTA: *"USTA requires a double walkover to produce a walkover in both
 * the same structure and the connected structure where the loser would have appeared. This is because
 * of ranking points … it is what is currently supported in ustatournamentdesk.com which is on factory
 * 2.2.32."* The default is the other way round (`doubleExitPropagateBye: true` since 2026-09-29), so a
 * USTA tournament has to say so, and this fixture is how it does.
 *
 * The fixture is read through `fixtures.policies`, the public path a consumer uses, so a fixture that
 * is defined but not exported fails here too. It is attached beside `POLICY_SCORING_USTA`, as a USTA
 * tournament carries both: the scoring policy turns exit propagation on, the progression policy decides
 * what a double exit sends to the connected structure.
 *
 * The draw is FIRST_ROUND_LOSER_CONSOLATION (USTA's "playback"): `Main|1|1` is the double walkover, its
 * loser would have taken side 1 of `Consolation|1|1`, and the loser of `Main|1|2` arrives opposite it.
 * The control is the same draw under the factory default, where that seat is a BYE.
 */

const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;

function build(drawId: string, progressionPolicy?: any) {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 16, drawType: FIRST_ROUND_LOSER_CONSOLATION, drawId }],
    policyDefinitions: fixtures.policies.POLICY_SCORING_USTA,
    nonRandom: 1,
    setState: true,
  });
  if (progressionPolicy) {
    const attached: any = tournamentEngine.attachPolicies({ policyDefinitions: progressionPolicy });
    expect(attached.success, `attachPolicies refused: ${JSON.stringify(attached.error)}`).toBe(true);
  }

  const matchUps = (): any[] => tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps ?? [];
  for (const step of [
    { at: 'Main|1|1', outcome: { matchUpStatus: DOUBLE_WALKOVER } },
    { at: 'Main|1|2', outcome: { winningSide: 1 } },
  ]) {
    const target = matchUps().find((m: any) => key(m) === step.at);
    // CONTROL: a coordinate naming no matchUp would skip the step that builds the state.
    expect(target, `${step.at} names no matchUp`).toBeTruthy();
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: target.matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(result?.error, `${step.at} refused: ${JSON.stringify(result?.error)}`).toBeUndefined();
  }

  const find = (at: string) => matchUps().find((m: any) => key(m) === at);
  const { drawDefinition } = tournamentEngine.getEvent({ drawId });
  const inconsistencies = (getDrawInconsistencies({ drawDefinition, drawId }) as any)?.inconsistencies ?? [];
  return { find, inconsistencies };
}

test('POLICY_PROGRESSION_USTA is exported and states doubleExitPropagateBye: false', () => {
  const { POLICY_PROGRESSION_USTA, POLICY_PROGRESSION_DEFAULT } = fixtures.policies;
  expect(POLICY_PROGRESSION_USTA?.[POLICY_TYPE_PROGRESSION]?.doubleExitPropagateBye).toBe(false);
  // the same setting the produced-exit pins run under
  expect(POLICY_PROGRESSION_USTA[POLICY_TYPE_PROGRESSION]).toMatchObject(PRODUCED_EXIT_POLICY[POLICY_TYPE_PROGRESSION]);
  // and nothing else differs from the default
  expect({ ...POLICY_PROGRESSION_USTA[POLICY_TYPE_PROGRESSION], doubleExitPropagateBye: true }).toEqual(
    POLICY_PROGRESSION_DEFAULT[POLICY_TYPE_PROGRESSION],
  );
});

test('USTA: a double walkover produces a WALKOVER in the connected structure, not a BYE', () => {
  const { find, inconsistencies } = build('usta-dwo', fixtures.policies.POLICY_PROGRESSION_USTA);

  // the connected structure: the seat the double walkover's loser would have taken is a produced
  // WALKOVER, awarded to the loser of Main|1|2 who arrived opposite it
  const fed = find('Consolation|1|1');
  expect(fed?.matchUpStatus, 'the connected structure must receive a produced WALKOVER').toEqual(WALKOVER);
  expect(fed?.winningSide, 'the produced WALKOVER is awarded to the arrival').toEqual(2);
  const winner = (fed?.sides ?? []).find((s: any) => s.sideNumber === fed.winningSide);
  expect(winner?.participantId, 'the WALKOVER is won by a real participant').toBeTruthy();
  expect(
    (fed?.sides ?? []).some((s: any) => s.bye),
    'no BYE may appear in the seat',
  ).toBe(false);
  expect(fed?.sideExitProvenance?.[1]).toMatchObject({
    previousMatchUpStatus: DOUBLE_WALKOVER,
    matchUpStatus: WALKOVER,
  });

  // the same structure: unconditional, and the same under either setting
  expect(find('Main|2|1')?.matchUpStatus, 'the same structure receives a produced WALKOVER').toEqual(WALKOVER);

  expect(inconsistencies.map((i: any) => i.issueType)).toEqual([]);
});

test('CONTROL: the same draw under the factory default puts a BYE in the connected structure', () => {
  const { find, inconsistencies } = build('default-dwo');

  const fed = find('Consolation|1|1');
  expect(fed?.matchUpStatus, 'the default propagates a BYE').toEqual(BYE);
  expect(fed?.winningSide, 'a BYE matchUp never carries a winningSide').toBeFalsy();

  // the same structure is unaffected by the policy
  expect(find('Main|2|1')?.matchUpStatus).toEqual(WALKOVER);

  expect(inconsistencies.map((i: any) => i.issueType)).toEqual([]);
});
